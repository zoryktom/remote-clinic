# Reproducibility

Remote Clinic uses deterministic random number generation based on seed strings.

Research exports include:

- simulation ID
- seed
- configuration
- software version
- generated timestamp
- metrics
- event samples
- failure samples

Given the same software version and configuration, experiment metrics should reproduce.
