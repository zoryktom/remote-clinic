# Metrics

Remote Clinic calculates transparent simulation metrics:

- access
- workflow completion
- resource efficiency
- AI verification
- follow-up
- staff workload
- cost
- overall score

Experiment metrics are stored with the result object and can be exported.

These are internal simulation metrics, not validated health outcomes.

`npm run validate` checks that experiment metrics are finite, nonnegative, reproducible by seed, and exportable in machine-readable formats.
