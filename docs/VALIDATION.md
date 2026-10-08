# Validation

Remote Clinic includes a runnable validation suite for the simulation layer:

```bash
npm run validate
```

The validation suite checks:

- deterministic replay for the same seed and configuration
- JSON, CSV, JSONL, and Markdown export integrity
- nonnegative finite metrics
- local-AI scenario behavior against the no-AI baseline
- simulation-only disclaimers
- traceability through experiment evidence graphs

## Evidence Graph

Each experiment can be exported as `remote_clinic.evidence_graph.v1`. The graph connects:

- experiment configuration
- metrics
- sampled timeline events
- simulated AI failures
- source-event identifiers

The graph is designed for audit, teaching, and reproducibility review. It is not a real patient graph and must not be used for clinical decision-making.

## In-App Use

Open the Research Lab, run the A/B experiment, then export:

- `Validation` for a Markdown validation report
- `Graph` for a JSON evidence graph
- `JSONL` for event and failure replay rows

All outputs are generated from synthetic patients and simulation events.
