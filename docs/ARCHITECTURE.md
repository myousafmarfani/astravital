# Architecture

```text
React/Vite five-destination astronaut interface
        |
        v
FastAPI validation and analysis API
        |
        v
SQLite observations, baselines, and alerts
```

The analysis logic is kept in the backend boundary rather than embedded in UI components. The primary interface is intentionally limited to Home, Health Check, My Health, Health Guide, and Emergency Help; secondary capabilities are embedded in those destinations instead of competing in primary navigation. Synthetic records are labeled in the UI, and the service worker caches static shell assets without caching private API responses.
