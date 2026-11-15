# AstraVital

AstraVital is an offline-aware astronaut health intelligence and monitoring prototype for the NASA Space Apps Challenge. Crew members create personal accounts, record six core indicators, compare observations with individual references, and review explainable trend signals.

> **Safety:** AstraVital is a research and demonstration prototype, not a medical device, flight-qualified system, diagnostic service, or substitute for qualified flight-surgeon oversight.

## Current vertical slice

- FastAPI backend with SQLite persistence.
- Authenticated crew-member accounts with empty personal workspaces.
- Heart rate, blood pressure, glucose, temperature, sleep, and mood observations.
- Individual reference values and explainable deviation alerts.
- React dashboard with trend chart and measurement entry.
- Five-destination astronaut workflow: Home, Health Check, My Health, Health Guide, and Emergency Help.
- Explicit no-data, insufficient-history, verification-required, and personal-reference states.
- Browser connectivity indicator, PWA manifest, and shell service worker.
- Local Emergency Response Center with incident history.
- Configurable, database-backed assessment schedules.
- Demonstration-only local protocol library with content hashes.
- Simulated communication outbox and mission software-readiness checks.

## Run locally

### Backend (PowerShell)

```powershell
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

API documentation: http://localhost:8000/docs

### Deploy the backend with Docker

Use `backend` as the Docker build context. The included image runs Uvicorn directly
and uses the platform-provided `PORT` value when available:

```powershell
docker build -t astravital-api .\backend
docker run --rm -p 8000:8000 astravital-api
```

For a container-based deployment, configure the service root/build context as
`backend`. Do not use the FastAPI CLI as the start command; the image already
starts `app.main:app` with Uvicorn.

### Frontend (PowerShell)

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and create a crew-member account. New accounts start with no health observations. Registration requires an email, a password of at least 10 characters, a display name, and optional mission details. Sign out from the top-right control to verify login.

## Checks

```powershell
cd backend
uv run pytest
uv run ruff check .

cd ..\frontend
npm run typecheck
npm run build
```

## Architecture

The backend owns validation, persistence, authentication, personal workspace isolation, baseline comparison, and alert generation. The frontend consumes those APIs and renders the mission-control interface. The browser service worker caches only the application shell; health records are intentionally not placed in a public cache. A production offline queue should use IndexedDB and idempotent synchronization before operational deployment.

## Limitations

Role-specific medical review, full IndexedDB synchronization, persistent background notifications, environmental records, reports, signed protocol-package verification, and real spacecraft/ground adapters remain planned extensions. Emergency workflows and communication states are local/simulated only. Thresholds are generic deviation signals, not clinical thresholds, and require medical-protocol review before any real use.
