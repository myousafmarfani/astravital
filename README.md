# AstraVital

AstraVital is an offline-aware astronaut health intelligence and monitoring
prototype created for the NASA Space Apps Challenge. It gives crew members a
personal mission health workspace for recording observations, comparing them
with individual references, reviewing explainable trend signals, and opening
local emergency workflows.


## Live deployment

- Frontend: <https://astravital.vercel.app>
- Backend API: <https://astravital-b9d1b0dd.fastapicloud.dev>
- Interactive API documentation:
  <https://astravital-b9d1b0dd.fastapicloud.dev/docs>

The frontend is configured to call the deployed backend at:

```text
https://astravital-b9d1b0dd.fastapicloud.dev/api/v1
```

## Product capabilities

### Crew accounts and personal workspaces

- Create an account with an email, password, display name, mission, and
  mission environment.
- Sign in and sign out from the mission-control interface.
- Receive a session token after registration or login.
- Keep observations, references, alerts, schedules, incidents, and
  communications scoped to the authenticated astronaut.
- Start with an empty workspace so missing data is visible rather than
  replaced by misleading sample values.

### Six primary health indicators

Crew members can record:

1. Heart rate
2. Blood pressure, including systolic and diastolic values
3. Blood glucose
4. Temperature
5. Sleep duration
6. Mood

Each observation can include a timestamp, unit, source, notes, and quality
state. Blood pressure requires both components. Records are validated by the
backend before they are stored.

### Personal references and explainable signals

- Store an individual reference value for each supported indicator.
- Mark references as verified or not verified.
- Compare observations with the astronaut's own reference rather than a
  generic population threshold.
- Generate an explainable `review` or `priority` signal when a supported
  observation differs materially from its reference.
- Show the observed value, reference value, percentage difference, and reason
  for the signal.
- Allow alerts to be acknowledged.
- Clearly distinguish:
  - No measurement recorded
  - Personal reference not established
  - Insufficient history
  - Measurement requiring verification
  - Trend requiring review
  - Comparable with a personal reference

These are trend signals only. They are not diagnoses.

### Health Check

The Health Check destination provides a guided place to record available
measurements. It is intentionally possible to complete only part of a check;
missing information remains explicit and is not interpreted as a healthy result.
After saving, the crew member can review the Home and My Health destinations
for data quality, history, references, and signals.

### My Health

The My Health destination includes:

- Current status for all six indicators
- A selectable trend chart for each indicator
- Up to the most recent 30 observations in a chart
- Personal reference values and verification state
- A timestamped observation table
- Source and quality labels
- A body explorer for selecting body regions
- A measurement form for new manual records

Charts are shown only when enough history exists to make a trend meaningful.
Synthetic records, when present, are explicitly labelled.

### Home dashboard

The Home destination provides a mission summary with:

- Current crew-member greeting
- Quick actions for Health Check, symptom reporting, and emergency help
- Connection status
- Number of recorded measurements
- Number of notifications requiring review
- Six-indicator status cards
- Recent health insights
- Clear empty-workspace messaging

### Health Guide

The Health Guide exposes the locally available protocol library. Each protocol
includes a title, category, version, applicability, content steps, status, and
content hash metadata on the backend. The current library is explicitly
demonstration-only and is not an approved clinical procedure.

### Emergency Assistance

Emergency Help provides a local Emergency Response Center for opening and
tracking an incident. It supports concerns including:

- Difficulty breathing
- Chest pain or discomfort
- Severe injury or physical incident
- Bleeding or wound concern
- Fainting or loss of consciousness
- Severe headache or neurological concern
- Eye or vision changes
- Dizziness or balance problems
- Abdominal or gastrointestinal discomfort
- Suspected infection or fever-related concern
- Psychological or behavioural health concern
- Possible environmental exposure
- Uncertain or unclear situation

For each incident, the crew member can identify whether the affected person is
the current astronaut or another crew member. The system then provides a
demonstration workflow with:

- Incident history
- Protocol title, version, and status
- Step-by-step progress
- Mark completed
- Request assistance
- Cannot complete
- Explicit local notification and ground-status fields

The interface states that this is a demonstration-only, non-clinical workflow.
In a real emergency, follow approved mission procedures and contact qualified
medical or emergency personnel.

### Medical communications outbox

The Communication Status view provides a simulated store-and-forward outbox:

- Queue a summary for a configured recipient role
- Record priority and creation time
- Display queued or simulated transmission status
- Keep the limitation visible: no ground transmission is claimed

This models mission communication states without connecting to spacecraft,
ground, or medical communication systems.

### Monitoring schedules

The backend supports database-backed assessment schedules:

- Create a schedule with title, category, frequency, next-due time, priority,
  and reason
- List schedules
- Mark a schedule complete

Schedules are part of the prototype mission workflow and do not currently
provide persistent background notifications.

### Connectivity and presentation

- Browser online/offline indicator
- Pending local-state indicator in the interface
- Dark and light themes
- Responsive mission-control navigation
- PWA manifest and application-shell service worker
- Mobile-friendly emergency entry point
- Accessible labels and explicit empty/error states

The service worker caches the application shell only. Health records are not
placed in a public cache.

## User workflow

1. Open the frontend and create a crew account.
2. Sign in if an account already exists.
3. Start a Health Check and record the indicators available today.
4. Review the Home dashboard for recorded data and signals.
5. Open My Health to inspect history and personal references.
6. Use Health Guide for locally available demonstration protocols.
7. Use Emergency Help to record and track a local incident when needed.
8. Use Communication Status to inspect simulated outbox state.
9. Sign out from the profile control when finished.

New accounts intentionally begin with no observations and no personal
references.

## Architecture

```text
frontend/                 React + TypeScript + Vite
    |
    | HTTPS JSON API
    v
backend/app/main.py       FastAPI application
    |
    v
storage/astravital.db     SQLite persistence
```

### Frontend

The frontend is a React single-page application built with TypeScript, Vite,
Recharts, Lucide icons, and Dexie. The main navigation is implemented in
`frontend/src/main.tsx` and contains Home, Health Check, My Health, Health
Guide, and Emergency Help destinations.

### Backend

The backend is a FastAPI application with Pydantic request validation,
authentication middleware, CORS configuration, SQLite persistence, and
automatic OpenAPI documentation.

The application entrypoint is:

```text
app.main:app
```

The API uses `/api/v1` as its versioned route prefix. The backend allows local
development origins and the deployed Vercel frontend origin:

```text
https://astravital.vercel.app
```

### Persistence

The current implementation uses SQLite at:

```text
storage/astravital.db
```

The database is created and initialized automatically on application startup.
The current deployment is a prototype; production persistence should use a
managed database and an explicit backup and migration strategy.

## API reference

FastAPI generates interactive documentation at `/docs` and an OpenAPI schema
at `/openapi.json`.

### Public endpoints

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/health
GET  /api/v1/hazards
```

### Authenticated account and health endpoints

```text
POST /api/v1/auth/logout
GET  /api/v1/astronauts
GET  /api/v1/observations
POST /api/v1/observations
GET  /api/v1/baselines
POST /api/v1/baselines
GET  /api/v1/alerts
POST /api/v1/alerts/{alert_id}/acknowledge
GET  /api/v1/symptom-reports
POST /api/v1/symptom-reports
```

### Monitoring, protocols, and emergency endpoints

```text
GET  /api/v1/monitoring/schedule
POST /api/v1/monitoring/schedule
POST /api/v1/monitoring/schedule/{schedule_id}/complete
GET  /api/v1/protocols
GET  /api/v1/protocols/{protocol_id}
POST /api/v1/emergency/incidents
GET  /api/v1/emergency/incidents
GET  /api/v1/emergency/incidents/{incident_id}
GET  /api/v1/emergency/incidents/{incident_id}/workflow
POST /api/v1/emergency/incidents/{incident_id}/workflow/{step_id}
GET  /api/v1/communications/outbox
POST /api/v1/communications/queue
GET  /api/v1/readiness
```

Authenticated requests use a bearer token:

```text
Authorization: Bearer <session-token>
```

## Repository layout

```text
astravital/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   └── main.py
│   ├── tests/
│   │   └── test_api.py
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── pyproject.toml
│   └── uv.lock
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── bodyExplorer.tsx
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.ts
├── storage/
├── docs/
├── .env.example
└── README.md
```

## Run locally

### Prerequisites

- Python 3.12 or newer
- `uv`
- Node.js and npm
- Docker Desktop only if building the container locally

### Backend

From PowerShell:

```powershell
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

The backend is available at <http://localhost:8000>. Open
<http://localhost:8000/docs> for interactive API documentation.

### Frontend

In a second PowerShell window:

```powershell
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

The deployed frontend is configured to use the FastAPI Cloud URL. For local
development against a local backend, change the `API` constant in
`frontend/src/main.tsx` to:

```text
http://localhost:8000/api/v1
```

Do not commit environment-specific endpoint changes unless they are intended
for the deployed frontend.

## Docker deployment

The backend includes a production Dockerfile. Use `backend` as the build
context:

```powershell
docker build -t astravital-api .\backend
docker run --rm -p 8000:8000 astravital-api
```

The image:

- Uses Python 3.12
- Installs dependencies from the locked `uv.lock` file
- Runs Uvicorn directly
- Binds to `0.0.0.0`
- Uses the platform-provided `PORT` value when available
- Defaults to port `8000`

For a container-based host, configure the service root or build context as
`backend`. The image starts:

```text
uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

For FastAPI Cloud's managed Python deployment, deploy the `backend` project
and keep the `fastapi[standard]` dependency in `pyproject.toml`. FastAPI Cloud
auto-discovers `app.main:app` and serves the application on its assigned
public URL.

## Configuration

The root `.env.example` documents the current prototype configuration:

```text
DATABASE_URL=sqlite:///./storage/astravital.db
AI_ENABLED=true
OPENROUTER_API_KEY=
OPENROUTER_MODEL=recraft/recraft-v4.1-flash-v2:free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

The current application uses the local SQLite path defined in the backend
code. Secrets such as API keys must be supplied through the deployment
platform's secret or environment-variable settings and must never be
committed to Git.

## Development checks

Run the backend checks:

```powershell
cd backend
uv run pytest
uv run ruff check .
uv lock --check
```

Run the frontend checks:

```powershell
cd frontend
npm run typecheck
npm run build
```

## Security and privacy considerations

- Authentication is required for protected API routes.
- Workspace data is scoped to the authenticated astronaut.
- Passwords are stored as salted PBKDF2-HMAC-SHA256 hashes.
- Session tokens are generated using secure random token generation.
- CORS is restricted to configured development and production frontend
  origins.
- Health records are not cached by the public service worker.
- The repository excludes `.env` files, local databases, virtual environments,
  and build output through `.gitignore`.
- The deployed prototype should not be used to store real operational medical
  data without a reviewed security, privacy, retention, and compliance plan.

## Current limitations and planned work

The following capabilities are intentionally incomplete or simulated:

- Role-specific medical review
- Full IndexedDB offline queue and idempotent synchronization
- Persistent background notifications
- Environmental and spacecraft telemetry records
- Medical reports and export workflows
- Signed protocol-package verification
- Real spacecraft, ground, or flight-surgeon adapters
- Real emergency dispatch or communication transmission
- Managed production database, backups, migrations, and retention controls
- Production-grade secret management and observability
- Clinical validation of thresholds and protocols

Emergency workflows, communication states, protocol content, and readiness
checks are local or simulated. Generic percentage deviations are not clinical
thresholds and require medical-protocol review before any real-world use.

## License and contribution

This repository is a challenge prototype. Before reusing it for operational,
clinical, or mission-critical work, perform appropriate engineering, medical,
security, privacy, regulatory, and human-factors reviews.
