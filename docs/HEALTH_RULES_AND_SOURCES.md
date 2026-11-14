# Health rules and sources

The current prototype uses one transparent, non-clinical rule: when an observation differs from the astronaut's configured individual reference by at least 15%, the API creates a review signal; at 25% it labels the signal priority. Mood is not numerically interpreted. These are engineering demonstration rules, not medical thresholds or diagnoses.

Educational hazard references are linked to NASA Human Research Program hazards:

- https://www.nasa.gov/hrp/hazards/
- https://www.nasa.gov/hrp/risks/
- https://osdr.nasa.gov/

Medical rules require review and approval against mission protocols before operational use.
