from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "storage" / "astravital.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

INDICATORS = ("heart_rate", "blood_pressure", "blood_glucose", "temperature", "sleep", "mood")
MOOD_VALUES = ("very_good", "good", "neutral", "stressed", "mentally_exhausted")
SOURCES = ("manual", "demo", "device")


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"{salt.hex()}:{digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split(":", 1)
    expected = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 120_000)
    return secrets.compare_digest(expected.hex(), digest_hex)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def get_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with closing(get_db()) as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS astronauts (
                id TEXT PRIMARY KEY, alias TEXT NOT NULL, mission TEXT NOT NULL,
                environment TEXT NOT NULL, mission_start TEXT NOT NULL, is_demo INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS observations (
                id TEXT PRIMARY KEY, astronaut_id TEXT NOT NULL, indicator TEXT NOT NULL,
                value REAL, secondary_value REAL, unit TEXT NOT NULL, context TEXT,
                measured_at TEXT NOT NULL, source TEXT NOT NULL, quality TEXT NOT NULL,
                is_synthetic INTEGER NOT NULL, notes TEXT, created_at TEXT NOT NULL,
                UNIQUE(astronaut_id, id)
            );
            CREATE TABLE IF NOT EXISTS baselines (
                id TEXT PRIMARY KEY, astronaut_id TEXT NOT NULL, indicator TEXT NOT NULL,
                value REAL NOT NULL, unit TEXT NOT NULL, method TEXT NOT NULL,
                observations INTEGER NOT NULL, verified INTEGER NOT NULL, created_at TEXT NOT NULL,
                UNIQUE(astronaut_id, indicator)
            );
            CREATE TABLE IF NOT EXISTS alerts (
                id TEXT PRIMARY KEY, astronaut_id TEXT NOT NULL, indicator TEXT NOT NULL,
                severity TEXT NOT NULL, title TEXT NOT NULL, explanation TEXT NOT NULL,
                observed_value TEXT NOT NULL, baseline_value TEXT, created_at TEXT NOT NULL,
                acknowledged INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS symptom_reports (
                id TEXT PRIMARY KEY, astronaut_id TEXT NOT NULL, regions TEXT NOT NULL,
                discomfort_type TEXT NOT NULL, description TEXT, started_at TEXT NOT NULL,
                duration TEXT, pattern TEXT NOT NULL, trajectory TEXT NOT NULL,
                intensity INTEGER, associated_symptoms TEXT, notes TEXT,
                submitted_at TEXT NOT NULL, is_draft INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL, role TEXT NOT NULL, astronaut_id TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS system_meta (
                key TEXT PRIMARY KEY, value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS assessment_schedules (
                id TEXT PRIMARY KEY, astronaut_id TEXT NOT NULL, title TEXT NOT NULL,
                category TEXT NOT NULL, frequency TEXT NOT NULL, next_due TEXT NOT NULL,
                priority TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL,
                last_completed TEXT
            );
            CREATE TABLE IF NOT EXISTS protocols (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
                version TEXT NOT NULL, status TEXT NOT NULL, applicability TEXT NOT NULL,
                content TEXT NOT NULL, source TEXT NOT NULL, content_hash TEXT NOT NULL,
                verified_at TEXT, simulated INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY, astronaut_id TEXT NOT NULL, category TEXT NOT NULL,
                affected_person TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
                protocol_id TEXT, local_notification_status TEXT NOT NULL,
                ground_status TEXT NOT NULL, notes TEXT
            );
            CREATE TABLE IF NOT EXISTS incident_events (
                id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, event_type TEXT NOT NULL,
                detail TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS incident_step_progress (
                incident_id TEXT NOT NULL, step_id TEXT NOT NULL, status TEXT NOT NULL,
                completed_by TEXT NOT NULL, updated_at TEXT NOT NULL,
                PRIMARY KEY (incident_id, step_id)
            );
            CREATE TABLE IF NOT EXISTS communications_outbox (
                id TEXT PRIMARY KEY, astronaut_id TEXT NOT NULL, incident_id TEXT,
                recipient_role TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL,
                payload TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL,
                last_attempt TEXT, acknowledged_at TEXT, error TEXT
            );
            """
        )
        if not db.execute("SELECT 1 FROM system_meta WHERE key = 'demo_data_removed'").fetchone():
            db.execute("DELETE FROM symptom_reports")
            db.execute("DELETE FROM alerts")
            db.execute("DELETE FROM observations")
            db.execute("DELETE FROM baselines")
            db.execute("DELETE FROM astronauts WHERE is_demo = 1")
            db.execute("INSERT INTO system_meta VALUES ('demo_data_removed', ?)", (now_iso(),))
        if not db.execute("SELECT 1 FROM protocols WHERE id = 'demo-emergency-workflow'").fetchone():
            content = json.dumps([
                "Confirm the affected person and record the event locally.",
                "Open the applicable mission medical reference supplied by authorized personnel.",
                "Notify the designated crew medical role using the configured local adapter.",
                "Document observations and follow approved mission procedures.",
            ])
            db.execute(
                """INSERT INTO protocols VALUES
                ('demo-emergency-workflow', 'Demonstration incident workflow',
                 'Emergency response', '0.1-demo', 'demonstration-only',
                 'Local prototype only', ?, 'AstraVital demonstration content', ?, ?, 1)""",
                (content, hashlib.sha256(content.encode()).hexdigest(), now_iso()),
            )
        db.commit()


class ObservationCreate(BaseModel):
    astronaut_id: str = "astro-001"
    indicator: Literal["heart_rate", "blood_pressure", "blood_glucose", "temperature", "sleep", "mood"]
    value: float = Field(ge=0)
    secondary_value: float | None = Field(default=None, ge=0)
    unit: str
    context: str | None = None
    measured_at: datetime
    source: Literal["manual", "demo", "device"] = "manual"
    notes: str | None = Field(default=None, max_length=500)
    is_synthetic: bool = False

    @field_validator("measured_at")
    @classmethod
    def timezone_required(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("measured_at must include a timezone")
        return value


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=2, max_length=100)
    mission: str = Field(default="Unassigned mission", max_length=120)
    environment: str = Field(default="Spacecraft", max_length=120)


class LoginRequest(BaseModel):
    email: str
    password: str


class ScheduleCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    category: str = Field(min_length=2, max_length=60)
    frequency: Literal["daily", "weekly", "custom"] = "daily"
    next_due: datetime
    priority: Literal["routine", "important"] = "routine"
    reason: str = Field(min_length=2, max_length=300)


class IncidentCreate(BaseModel):
    category: str = Field(min_length=2, max_length=80)
    affected_person: str = Field(default="self", max_length=120)
    notes: str | None = Field(default=None, max_length=1000)


class CommunicationCreate(BaseModel):
    incident_id: str | None = None
    recipient_role: Literal["crew_medical_officer", "flight_surgeon"] = "flight_surgeon"
    priority: Literal["routine", "urgent"] = "routine"


class BaselineCreate(BaseModel):
    astronaut_id: str = "astro-001"
    indicator: str
    value: float = Field(ge=0)
    unit: str
    method: str = "manually established"


class SymptomReportCreate(BaseModel):
    astronaut_id: str = "astro-001"
    regions: list[str] = Field(min_length=1, max_length=8)
    discomfort_type: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=1000)
    started_at: datetime
    duration: str | None = Field(default=None, max_length=80)
    pattern: Literal["ongoing", "intermittent"] = "ongoing"
    trajectory: Literal["improving", "unchanged", "worsening"] = "unchanged"
    intensity: int | None = Field(default=None, ge=0, le=10)
    associated_symptoms: list[str] = Field(default_factory=list, max_length=12)
    notes: str | None = Field(default=None, max_length=1000)
    is_draft: bool = False

    @field_validator("started_at")
    @classmethod
    def symptom_timezone_required(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("started_at must include a timezone")
        return value


def row_dict(row: sqlite3.Row) -> dict:
    result = dict(row)
    for key in ("is_synthetic", "acknowledged", "verified"):
        if key in result:
            result[key] = bool(result[key])
    if "regions" in result:
        result["regions"] = json.loads(result["regions"])
    if "associated_symptoms" in result:
        result["associated_symptoms"] = json.loads(result["associated_symptoms"])
    return result


def analyze(observation: dict, baseline: sqlite3.Row | None) -> dict | None:
    if not baseline or observation["indicator"] == "mood":
        return None
    delta = observation["value"] - baseline["value"]
    percent = abs(delta) / max(abs(baseline["value"]), 1) * 100
    if percent < 15:
        return None
    severity = "review" if percent < 25 else "priority"
    return {
        "id": str(uuid4()), "astronaut_id": observation["astronaut_id"],
        "indicator": observation["indicator"], "severity": severity,
        "title": f"{observation['indicator'].replace('_', ' ').title()} differs from baseline",
        "explanation": (
            f"Observed {observation['value']} {observation['unit']} versus the "
            f"individual reference of {baseline['value']} {baseline['unit']} "
            f"({percent:.1f}% difference). This is a trend signal for review, not a diagnosis."
        ),
        "observed_value": f"{observation['value']} {observation['unit']}",
        "baseline_value": f"{baseline['value']} {baseline['unit']}",
        "created_at": now_iso(), "acknowledged": False,
    }


app = FastAPI(title="AstraVital API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_session(request: Request, call_next):
    public_paths = {"/api/v1/health", "/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/hazards"}
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path.startswith("/api/v1/") and request.url.path not in public_paths:
        token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        with closing(get_db()) as db:
            session = db.execute("SELECT user_id FROM sessions WHERE token = ?", (token,)).fetchone()
        if not session:
            return JSONResponse({"detail": "Authentication required"}, status_code=401)
        with closing(get_db()) as db:
            user = db.execute("SELECT astronaut_id FROM users WHERE id = ?", (session["user_id"],)).fetchone()
        request.state.astronaut_id = user["astronaut_id"]
    return await call_next(request)


@app.on_event("startup")
def startup() -> None:
    init_db()


init_db()


@app.post("/api/v1/auth/register", status_code=201)
def register(payload: RegisterRequest) -> dict:
    email = payload.email.strip().lower()
    with closing(get_db()) as db:
        if db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise HTTPException(409, "An account with this email already exists")
        astronaut_id = f"crew-{uuid4().hex[:12]}"
        user_id = str(uuid4())
        db.execute(
            "INSERT INTO astronauts VALUES (?, ?, ?, ?, ?, 0)",
            (astronaut_id, payload.display_name.strip(), payload.mission.strip(),
             payload.environment.strip(), now_iso()),
        )
        db.execute(
            "INSERT INTO users VALUES (?, ?, ?, ?, 'astronaut', ?, ?)",
            (user_id, email, hash_password(payload.password), payload.display_name.strip(),
             astronaut_id, now_iso()),
        )
        token = secrets.token_urlsafe(32)
        db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (token, user_id, now_iso()))
        db.commit()
        return {"token": token, "user": {"id": user_id, "email": email, "display_name": payload.display_name.strip(), "role": "astronaut"}, "astronaut_id": astronaut_id}


@app.post("/api/v1/auth/login")
def login(payload: LoginRequest) -> dict:
    with closing(get_db()) as db:
        user = db.execute("SELECT * FROM users WHERE email = ?", (payload.email.strip().lower(),)).fetchone()
        if not user or not verify_password(payload.password, user["password_hash"]):
            raise HTTPException(401, "Invalid email or password")
        token = secrets.token_urlsafe(32)
        db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (token, user["id"], now_iso()))
        db.commit()
        return {"token": token, "user": {"id": user["id"], "email": user["email"], "display_name": user["display_name"], "role": user["role"]}, "astronaut_id": user["astronaut_id"]}


@app.post("/api/v1/auth/logout")
def logout(request: Request) -> dict:
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    with closing(get_db()) as db:
        db.execute("DELETE FROM sessions WHERE token = ?", (token,))
        db.commit()
    return {"logged_out": True}


@app.get("/api/v1/health")
def health() -> dict:
    return {"status": "ok", "service": "astravital-api", "timestamp": now_iso()}


@app.get("/api/v1/astronauts")
def astronauts() -> list[dict]:
    with closing(get_db()) as db:
        return [row_dict(row) for row in db.execute("SELECT * FROM astronauts ORDER BY alias")]


@app.get("/api/v1/observations")
def observations(
    request: Request,
    astronaut_id: str = Query("astro-001"),
    indicator: str | None = None,
    limit: int = Query(100, ge=1, le=500),
) -> list[dict]:
    astronaut_id = request.state.astronaut_id
    with closing(get_db()) as db:
        if indicator:
            rows = db.execute(
                "SELECT * FROM observations WHERE astronaut_id = ? AND indicator = ? "
                "ORDER BY measured_at DESC LIMIT ?", (astronaut_id, indicator, limit)
            )
        else:
            rows = db.execute(
                "SELECT * FROM observations WHERE astronaut_id = ? "
                "ORDER BY measured_at DESC LIMIT ?", (astronaut_id, limit)
            )
        return [row_dict(row) for row in rows]


@app.post("/api/v1/observations", status_code=201)
def create_observation(payload: ObservationCreate, request: Request) -> dict:
    payload.astronaut_id = request.state.astronaut_id
    if payload.indicator == "blood_pressure" and payload.secondary_value is None:
        raise HTTPException(422, "Blood pressure requires diastolic secondary_value")
    quality = "valid"
    if payload.indicator == "blood_pressure" and (
        payload.value < 50
        or payload.value > 300
        or payload.secondary_value is None
        or payload.secondary_value < 30
        or payload.secondary_value > 200
        or payload.value <= payload.secondary_value
    ):
        quality = "requires_verification"
    with closing(get_db()) as db:
        astronaut = db.execute("SELECT id FROM astronauts WHERE id = ?", (payload.astronaut_id,)).fetchone()
        if not astronaut:
            raise HTTPException(404, "Astronaut not found")
        observation = {
            "id": str(uuid4()), **payload.model_dump(),
            "measured_at": payload.measured_at.isoformat(), "quality": quality,
            "created_at": now_iso(),
        }
        db.execute(
            """INSERT INTO observations
            (id, astronaut_id, indicator, value, secondary_value, unit, context, measured_at,
             source, quality, is_synthetic, notes, created_at)
             VALUES (:id, :astronaut_id, :indicator, :value, :secondary_value, :unit, :context,
                     :measured_at, :source, :quality, :is_synthetic, :notes, :created_at)""",
            observation,
        )
        baseline = db.execute(
            "SELECT * FROM baselines WHERE astronaut_id = ? AND indicator = ?",
            (payload.astronaut_id, payload.indicator),
        ).fetchone()
        alert = analyze(observation, baseline)
        if alert:
            db.execute(
                """INSERT INTO alerts
                (id, astronaut_id, indicator, severity, title, explanation, observed_value,
                 baseline_value, created_at, acknowledged)
                VALUES (:id, :astronaut_id, :indicator, :severity, :title, :explanation,
                        :observed_value, :baseline_value, :created_at, :acknowledged)""",
                alert,
            )
        db.commit()
        return {"observation": observation, "alert": alert}


@app.get("/api/v1/baselines")
def baselines(request: Request, astronaut_id: str = "astro-001") -> list[dict]:
    astronaut_id = request.state.astronaut_id
    with closing(get_db()) as db:
        return [row_dict(row) for row in db.execute(
            "SELECT * FROM baselines WHERE astronaut_id = ? ORDER BY indicator", (astronaut_id,)
        )]


@app.post("/api/v1/baselines", status_code=201)
def create_baseline(payload: BaselineCreate, request: Request) -> dict:
    payload.astronaut_id = request.state.astronaut_id
    with closing(get_db()) as db:
        record = {"id": str(uuid4()), **payload.model_dump(), "observations": 0,
                  "verified": False, "created_at": now_iso()}
        db.execute(
            """INSERT INTO baselines
            (id, astronaut_id, indicator, value, unit, method, observations, verified, created_at)
            VALUES (:id, :astronaut_id, :indicator, :value, :unit, :method, :observations,
                    :verified, :created_at)
            ON CONFLICT(astronaut_id, indicator) DO UPDATE SET value=excluded.value, unit=excluded.unit,
            method=excluded.method, created_at=excluded.created_at""",
            record,
        )
        db.commit()
        return record


@app.get("/api/v1/alerts")
def alerts(request: Request, astronaut_id: str = "astro-001") -> list[dict]:
    astronaut_id = request.state.astronaut_id
    with closing(get_db()) as db:
        return [row_dict(row) for row in db.execute(
            "SELECT * FROM alerts WHERE astronaut_id = ? ORDER BY created_at DESC", (astronaut_id,)
        )]


@app.post("/api/v1/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str) -> dict:
    with closing(get_db()) as db:
        updated = db.execute("UPDATE alerts SET acknowledged = 1 WHERE id = ?", (alert_id,))
        if updated.rowcount == 0:
            raise HTTPException(404, "Alert not found")
        db.commit()
        return {"id": alert_id, "acknowledged": True}


@app.get("/api/v1/symptom-reports")
def symptom_reports(request: Request, astronaut_id: str = "astro-001") -> list[dict]:
    astronaut_id = request.state.astronaut_id
    with closing(get_db()) as db:
        return [row_dict(row) for row in db.execute(
            "SELECT * FROM symptom_reports WHERE astronaut_id = ? ORDER BY submitted_at DESC",
            (astronaut_id,),
        )]


@app.post("/api/v1/symptom-reports", status_code=201)
def create_symptom_report(payload: SymptomReportCreate, request: Request) -> dict:
    payload.astronaut_id = request.state.astronaut_id
    with closing(get_db()) as db:
        if not db.execute("SELECT id FROM astronauts WHERE id = ?", (payload.astronaut_id,)).fetchone():
            raise HTTPException(404, "Astronaut not found")
        record = {
            "id": str(uuid4()), **payload.model_dump(),
            "regions": json.dumps(payload.regions),
            "associated_symptoms": json.dumps(payload.associated_symptoms),
            "started_at": payload.started_at.isoformat(),
            "submitted_at": now_iso(),
        }
        db.execute(
            """INSERT INTO symptom_reports
            (id, astronaut_id, regions, discomfort_type, description, started_at, duration,
             pattern, trajectory, intensity, associated_symptoms, notes, submitted_at, is_draft)
             VALUES (:id, :astronaut_id, :regions, :discomfort_type, :description, :started_at,
                     :duration, :pattern, :trajectory, :intensity, :associated_symptoms, :notes,
                     :submitted_at, :is_draft)""",
            record,
        )
        db.commit()
        return row_dict(db.execute("SELECT * FROM symptom_reports WHERE id = ?", (record["id"],)).fetchone())


@app.get("/api/v1/monitoring/schedule")
def monitoring_schedule(request: Request) -> list[dict]:
    with closing(get_db()) as db:
        return [row_dict(row) for row in db.execute(
            "SELECT * FROM assessment_schedules WHERE astronaut_id = ? ORDER BY next_due",
            (request.state.astronaut_id,),
        )]


@app.post("/api/v1/monitoring/schedule", status_code=201)
def create_schedule(payload: ScheduleCreate, request: Request) -> dict:
    record = {"id": str(uuid4()), "astronaut_id": request.state.astronaut_id, **payload.model_dump(),
              "next_due": payload.next_due.isoformat(), "status": "scheduled", "last_completed": None}
    with closing(get_db()) as db:
        db.execute(
            """INSERT INTO assessment_schedules
            (id, astronaut_id, title, category, frequency, next_due, priority, status, reason, last_completed)
            VALUES (:id, :astronaut_id, :title, :category, :frequency, :next_due, :priority,
                    :status, :reason, :last_completed)""", record)
        db.commit()
    return record


@app.post("/api/v1/monitoring/schedule/{schedule_id}/complete")
def complete_schedule(schedule_id: str, request: Request) -> dict:
    with closing(get_db()) as db:
        row = db.execute(
            "SELECT * FROM assessment_schedules WHERE id = ? AND astronaut_id = ?",
            (schedule_id, request.state.astronaut_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Scheduled assessment not found")
        db.execute(
            "UPDATE assessment_schedules SET status = 'completed', last_completed = ? WHERE id = ?",
            (now_iso(), schedule_id),
        )
        db.commit()
        return {"id": schedule_id, "status": "completed", "completed_at": now_iso()}


@app.get("/api/v1/protocols")
def protocols() -> list[dict]:
    with closing(get_db()) as db:
        return [{**row_dict(row), "content": json.loads(row["content"])} for row in db.execute(
            "SELECT * FROM protocols ORDER BY title"
        )]


@app.get("/api/v1/protocols/{protocol_id}")
def protocol(protocol_id: str) -> dict:
    with closing(get_db()) as db:
        row = db.execute("SELECT * FROM protocols WHERE id = ?", (protocol_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Protocol not found")
        return {**row_dict(row), "content": json.loads(row["content"])}


def workflow_steps(content: list[str]) -> list[dict]:
    return [
        {
            "id": f"step-{index}",
            "instruction": instruction,
            "why": "This demonstration step records the response context for qualified medical review.",
            "required": True,
        }
        for index, instruction in enumerate(content, 1)
    ]


@app.post("/api/v1/emergency/incidents", status_code=201)
def create_incident(payload: IncidentCreate, request: Request) -> dict:
    incident_id = str(uuid4())
    with closing(get_db()) as db:
        db.execute(
            """INSERT INTO incidents
            VALUES (?, ?, ?, ?, 'opened', ?, 'demo-emergency-workflow',
                    'queued-simulated', 'not-queued', ?)""",
            (incident_id, request.state.astronaut_id, payload.category,
             payload.affected_person, now_iso(), payload.notes),
        )
        db.execute(
            "INSERT INTO incident_events VALUES (?, ?, 'opened', ?, ?)",
            (str(uuid4()), incident_id, "Incident recorded locally; no external notification claimed.", now_iso()),
        )
        db.commit()
    return incident(request, incident_id)


@app.get("/api/v1/emergency/incidents")
def incidents(request: Request) -> list[dict]:
    with closing(get_db()) as db:
        return [row_dict(row) for row in db.execute(
            "SELECT * FROM incidents WHERE astronaut_id = ? ORDER BY created_at DESC",
            (request.state.astronaut_id,),
        )]


@app.get("/api/v1/emergency/incidents/{incident_id}")
def incident(request: Request, incident_id: str) -> dict:
    with closing(get_db()) as db:
        row = db.execute(
            "SELECT * FROM incidents WHERE id = ? AND astronaut_id = ?",
            (incident_id, request.state.astronaut_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Incident not found")
        events = [row_dict(event) for event in db.execute(
            "SELECT * FROM incident_events WHERE incident_id = ? ORDER BY created_at", (incident_id,)
        )]
        return {"incident": row_dict(row), "timeline": events}


@app.get("/api/v1/emergency/incidents/{incident_id}/workflow")
def incident_workflow(request: Request, incident_id: str) -> dict:
    with closing(get_db()) as db:
        incident_row = db.execute(
            "SELECT * FROM incidents WHERE id = ? AND astronaut_id = ?",
            (incident_id, request.state.astronaut_id),
        ).fetchone()
        if not incident_row:
            raise HTTPException(404, "Incident not found")
        protocol_row = db.execute(
            "SELECT * FROM protocols WHERE id = ?", (incident_row["protocol_id"],)
        ).fetchone()
        if not protocol_row:
            raise HTTPException(409, "Required local protocol is unavailable")
        steps = workflow_steps(json.loads(protocol_row["content"]))
        progress = {
            row["step_id"]: row_dict(row)
            for row in db.execute(
                "SELECT * FROM incident_step_progress WHERE incident_id = ?", (incident_id,)
            )
        }
        return {
            "incident": row_dict(incident_row),
            "protocol": {**row_dict(protocol_row), "content": None},
            "steps": [{**step, "progress": progress.get(step["id"])} for step in steps],
            "offline": True,
            "demonstration_only": bool(protocol_row["simulated"]),
        }


class IncidentStepUpdate(BaseModel):
    status: Literal["completed", "cannot_complete", "needs_assistance"]


@app.post("/api/v1/emergency/incidents/{incident_id}/workflow/{step_id}")
def update_incident_step(
    incident_id: str, step_id: str, payload: IncidentStepUpdate, request: Request
) -> dict:
    with closing(get_db()) as db:
        incident_row = db.execute(
            "SELECT id FROM incidents WHERE id = ? AND astronaut_id = ?",
            (incident_id, request.state.astronaut_id),
        ).fetchone()
        if not incident_row:
            raise HTTPException(404, "Incident not found")
        updated_at = now_iso()
        db.execute(
            """INSERT INTO incident_step_progress
            (incident_id, step_id, status, completed_by, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(incident_id, step_id) DO UPDATE SET
              status = excluded.status, completed_by = excluded.completed_by,
              updated_at = excluded.updated_at""",
            (incident_id, step_id, payload.status, request.state.astronaut_id, updated_at),
        )
        db.execute(
            "INSERT INTO incident_events VALUES (?, ?, ?, ?, ?)",
            (str(uuid4()), incident_id, "workflow_step", f"{step_id}: {payload.status}", updated_at),
        )
        db.commit()
        return {"incident_id": incident_id, "step_id": step_id, "status": payload.status, "updated_at": updated_at}


@app.get("/api/v1/communications/outbox")
def communications_outbox(request: Request) -> list[dict]:
    with closing(get_db()) as db:
        return [row_dict(row) for row in db.execute(
            "SELECT * FROM communications_outbox WHERE astronaut_id = ? ORDER BY created_at DESC",
            (request.state.astronaut_id,),
        )]


@app.post("/api/v1/communications/queue", status_code=201)
def queue_communication(payload: CommunicationCreate, request: Request) -> dict:
    message = {
        "id": str(uuid4()), "astronaut_id": request.state.astronaut_id,
        "incident_id": payload.incident_id, "recipient_role": payload.recipient_role,
        "priority": payload.priority, "status": "queued-local",
        "payload": json.dumps({"notice": "Transmission is simulated and awaiting an approved adapter."}),
        "created_at": now_iso(), "attempts": 0, "last_attempt": None,
        "acknowledged_at": None, "error": None,
    }
    with closing(get_db()) as db:
        db.execute(
            """INSERT INTO communications_outbox
            (id, astronaut_id, incident_id, recipient_role, priority, status, payload,
             created_at, attempts, last_attempt, acknowledged_at, error)
            VALUES (:id, :astronaut_id, :incident_id, :recipient_role, :priority, :status,
                    :payload, :created_at, :attempts, :last_attempt, :acknowledged_at, :error)""",
            message,
        )
        db.commit()
    return message


@app.get("/api/v1/readiness")
def readiness(request: Request) -> dict:
    with closing(get_db()) as db:
        checks = [
            ("Account profile", bool(db.execute("SELECT 1 FROM astronauts WHERE id = ?", (request.state.astronaut_id,)).fetchone()), "Crew profile is available."),
            ("Protocol package", bool(db.execute("SELECT 1 FROM protocols WHERE status = 'demonstration-only'").fetchone()), "Verified demonstration content is local."),
            ("Database writable", True, "SQLite persistence is available."),
            ("Emergency recording", True, "Local incident recording endpoint is configured."),
            ("Ground communications", False, "No real spacecraft or ground adapter is configured; messages remain queued locally."),
        ]
    items = [{"name": name, "passed": passed, "detail": detail} for name, passed, detail in checks]
    return {"status": "ready-with-limitations" if all(item["passed"] or item["name"] == "Ground communications" for item in items) else "action-required", "items": items, "disclaimer": "This checks software configuration only; it is not flight or medical readiness."}


@app.get("/api/v1/hazards")
def hazards() -> list[dict]:
    return [
        {"id": "radiation", "title": "Space radiation", "summary": "Radiation exposure is a mission hazard requiring monitoring and protection.", "source": "NASA Human Research Program", "url": "https://www.nasa.gov/hrp/hazards/"},
        {"id": "isolation", "title": "Isolation and confinement", "summary": "Confinement can affect sleep, mood, teamwork, and performance.", "source": "NASA Human Research Program", "url": "https://www.nasa.gov/hrp/hazards/"},
        {"id": "distance", "title": "Distance from Earth", "summary": "Communication delays make onboard health understanding and records important.", "source": "NASA Human Research Program", "url": "https://www.nasa.gov/hrp/hazards/"},
        {"id": "gravity", "title": "Gravity fields", "summary": "Microgravity can affect musculoskeletal, cardiovascular, vestibular, and visual systems.", "source": "NASA Human Research Program", "url": "https://www.nasa.gov/hrp/hazards/"},
        {"id": "environment", "title": "Hostile and closed environments", "summary": "Air quality, pressure, temperature, and other environmental conditions require monitoring.", "source": "NASA Human Research Program", "url": "https://www.nasa.gov/hrp/hazards/"},
    ]
