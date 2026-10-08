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

Run:

```bash
npm run validate
```

The validation suite replays the local-AI experiment with the same configuration and checks that metrics and failure identifiers reproduce.
