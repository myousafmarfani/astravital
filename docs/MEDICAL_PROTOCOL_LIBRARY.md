# Medical protocol library

Protocols are stored locally and exposed through `/api/v1/protocols`. The included workflow is explicitly `demonstration-only`; it contains documentation and notification placeholders, not treatment instructions.

Each package carries a version, applicability, content hash, local status, and simulated flag. Production packages require authorized signing, verification keys, expiry handling, and medical approval before operational use.
