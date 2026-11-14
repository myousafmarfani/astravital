# Baseline management

The current prototype stores manually established per-astronaut references separately from longitudinal observations. New observations do not silently replace references. Preflight import, in-flight reference generation, reviewer approval, version history, and controlled CSV/JSON import remain planned extensions.

The dashboard treats missing references as unavailable rather than healthy. Any future clinical baseline must include provenance, review status, version, reviewer, and approval state.
