# Mission medical readiness

`GET /api/v1/readiness` checks software configuration: crew profile, local demonstration protocol, database persistence, emergency recording, and ground-adapter availability. The result is `ready-with-limitations` when the local prototype works but no real communications adapter is configured.

This is not crew fitness, medical readiness, spacecraft certification, or flight qualification.
