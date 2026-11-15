from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
auth = client.post("/api/v1/auth/register", json={
    "email": f"test-{uuid4().hex}@example.test", "password": "secure-test-password",
    "display_name": "Test Crew",
}).json()
client.headers.update({"Authorization": f"Bearer {auth['token']}"})


def test_health_and_demo_records():
    assert client.get("/api/v1/health").json()["status"] == "ok"
    records = client.get(f"/api/v1/observations?astronaut_id={auth['astronaut_id']}&indicator=heart_rate").json()
    assert records == []


def test_authenticated_preflight_is_allowed():
    response = client.options(
        "/api/v1/observations",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_deployed_frontend_preflight_is_allowed():
    response = client.options(
        "/api/v1/auth/register",
        headers={
            "Origin": "https://astravital.vercel.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://astravital.vercel.app"


def test_observation_generates_explainable_alert():
    client.post("/api/v1/baselines", json={
        "astronaut_id": auth["astronaut_id"], "indicator": "heart_rate", "value": 68, "unit": "bpm",
    })
    response = client.post("/api/v1/observations", json={
        "astronaut_id": auth["astronaut_id"], "indicator": "heart_rate", "value": 95, "unit": "bpm",
        "measured_at": datetime.now(UTC).isoformat(), "source": "manual",
    })
    assert response.status_code == 201
    assert response.json()["alert"]["explanation"].startswith("Observed")


def test_blood_pressure_requires_two_components():
    response = client.post("/api/v1/observations", json={
        "astronaut_id": auth["astronaut_id"], "indicator": "blood_pressure", "value": 120, "unit": "mmHg",
        "measured_at": datetime.now(UTC).isoformat(),
    })
    assert response.status_code == 422


def test_suspicious_blood_pressure_requires_verification():
    response = client.post("/api/v1/observations", json={
        "astronaut_id": auth["astronaut_id"], "indicator": "blood_pressure",
        "value": 32, "secondary_value": 76, "unit": "mmHg",
        "measured_at": datetime.now(UTC).isoformat(), "source": "manual",
    })
    assert response.status_code == 201
    assert response.json()["observation"]["quality"] == "requires_verification"


def test_symptom_report_is_persisted_with_region():
    response = client.post("/api/v1/symptom-reports", json={
        "astronaut_id": auth["astronaut_id"],
        "regions": ["chest"],
        "discomfort_type": "pressure",
        "started_at": datetime.now(UTC).isoformat(),
        "pattern": "intermittent",
        "trajectory": "unchanged",
        "associated_symptoms": ["fatigue"],
    })
    assert response.status_code == 201
    report = response.json()
    assert report["regions"] == ["chest"]
    assert client.get(f"/api/v1/symptom-reports?astronaut_id={auth['astronaut_id']}").json()


def test_mission_modules_are_local_and_persistent():
    protocols = client.get("/api/v1/protocols")
    assert protocols.status_code == 200
    assert protocols.json()[0]["status"] == "demonstration-only"

    schedule = client.post("/api/v1/monitoring/schedule", json={
        "title": "Sleep check-in", "category": "sleep", "frequency": "daily",
        "next_due": datetime.now(UTC).isoformat(), "priority": "routine",
        "reason": "Configured demonstration task",
    })
    assert schedule.status_code == 201
    assert client.post(f"/api/v1/monitoring/schedule/{schedule.json()['id']}/complete").status_code == 200

    incident = client.post("/api/v1/emergency/incidents", json={
        "category": "chest-discomfort", "affected_person": "self",
    })
    assert incident.status_code == 201
    incident_id = incident.json()["incident"]["id"]
    assert client.get(f"/api/v1/emergency/incidents/{incident_id}").json()["incident"]["status"] == "opened"
    workflow = client.get(f"/api/v1/emergency/incidents/{incident_id}/workflow")
    assert workflow.status_code == 200
    step_id = workflow.json()["steps"][0]["id"]
    progress = client.post(
        f"/api/v1/emergency/incidents/{incident_id}/workflow/{step_id}",
        json={"status": "needs_assistance"},
    )
    assert progress.status_code == 200
    assert client.get(f"/api/v1/emergency/incidents/{incident_id}/workflow").json()["steps"][0]["progress"]["status"] == "needs_assistance"

    queued = client.post("/api/v1/communications/queue", json={
        "recipient_role": "flight_surgeon", "priority": "urgent",
    })
    assert queued.status_code == 201
    assert queued.json()["status"] == "queued-local"
    assert client.get("/api/v1/readiness").json()["status"] == "ready-with-limitations"
