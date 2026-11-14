# Testing

Backend tests:

```powershell
cd backend
uv run pytest
uv run ruff check .
```

Frontend checks:

```powershell
cd frontend
npm run typecheck
npm run build
```

The suite covers authentication, empty workspaces, preflight-free observation entry, explainable alert generation, CORS preflight, symptom reporting, schedules, local protocols, incidents, communication outbox, and readiness checks. Browser end-to-end and IndexedDB persistence tests are not yet implemented.
