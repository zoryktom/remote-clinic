import { exportExperiment, makeDefaultExperimentConfigs, runExperiment } from './clinicSimulation'
import type { ExperimentMetrics, ExperimentResult } from './types'

export interface ValidationGate {
  name: string
  passed: boolean
  observed: string | number | boolean
  expected: string | number | boolean
}

export interface ValidationReport {
  schemaVersion: 'remote_clinic.validation_report.v1'
  passed: boolean
  seed: string
  results: Array<{
    id: string
    label: string
    metrics: ExperimentMetrics
  }>
  gates: ValidationGate[]
  interpretation: string
}

export interface ExperimentEvidenceGraph {
  schemaVersion: 'remote_clinic.evidence_graph.v1'
  experimentId: string
  nodes: Array<Record<string, string | number | boolean>>
  edges: Array<Record<string, string | number | boolean>>
  coverage: {
    metricCount: number
    eventCount: number
    failureCount: number
    linkedFailures: number
  }
  reviewGate: {
    status: 'simulation_only'
    realWorldUse: false
    reasons: string[]
  }
}

export function runValidationSuite(results?: ExperimentResult[], seed = 'REMOTE-VALIDATION'): ValidationReport {
  const evaluatedResults = results ?? makeDefaultExperimentConfigs(seed).map((config) => runExperiment(config))
  const baseline = evaluatedResults[0]
  const localAi = evaluatedResults[1] ?? evaluatedResults[0]
  const replay = runExperiment(localAi.config)
  const graph = buildExperimentEvidenceGraph(localAi)
  const gates: ValidationGate[] = [
    gate(
      'deterministic_replay_metrics',
      JSON.stringify(replay.metrics) === JSON.stringify(localAi.metrics),
      'metrics match on replay',
      'metrics match on replay',
    ),
    gate(
      'deterministic_replay_failures',
      replay.failures.map((failure) => failure.id).join(',') === localAi.failures.map((failure) => failure.id).join(','),
      replay.failures.length,
      localAi.failures.length,
    ),
    gate('json_export_parses', parsesJson(exportExperiment(localAi, 'json')), true, true),
    gate('csv_export_has_metric_header', exportExperiment(localAi, 'csv').startsWith('metric,value'), true, true),
    gate('jsonl_export_contains_events', exportExperiment(localAi, 'jsonl').includes('"type":"event"'), true, true),
    gate('markdown_export_is_labeled_simulation', exportExperiment(localAi, 'markdown').includes('SIMULATION RESULT'), true, true),
    gate('metrics_are_nonnegative_finite', metricsAreNonnegativeFinite(localAi.metrics), true, true),
    gate('local_ai_runs_queries', localAi.metrics.aiQueries > baseline.metrics.aiQueries, localAi.metrics.aiQueries, `> ${baseline.metrics.aiQueries}`),
    gate(
      'local_ai_resolves_at_least_baseline_gaps',
      localAi.metrics.careGapsResolved >= baseline.metrics.careGapsResolved,
      localAi.metrics.careGapsResolved,
      `>= ${baseline.metrics.careGapsResolved}`,
    ),
    gate(
      'simulation_disclaimer_present',
      localAi.reproducibility.note.toLowerCase().includes('synthetic patients'),
      localAi.reproducibility.note,
      'mentions synthetic patients',
    ),
    gate('evidence_graph_has_traceable_events', graph.coverage.eventCount > 0, graph.coverage.eventCount, '> 0'),
  ]

  return {
    schemaVersion: 'remote_clinic.validation_report.v1',
    passed: gates.every((item) => item.passed),
    seed,
    results: evaluatedResults.map((result) => ({
      id: result.id,
      label: result.config.label,
      metrics: result.metrics,
    })),
    gates,
    interpretation:
      'Validation gates check deterministic replay, export integrity, scenario behavior, and simulation traceability. They do not claim real-world clinical effectiveness.',
  }
}

export function buildExperimentEvidenceGraph(result: ExperimentResult): ExperimentEvidenceGraph {
  const nodes: ExperimentEvidenceGraph['nodes'] = [
    { id: `experiment:${result.id}`, type: 'experiment', label: result.config.label },
    { id: `config:${result.id}`, type: 'configuration', seed: result.config.seed, runs: result.config.runs },
  ]
  const edges: ExperimentEvidenceGraph['edges'] = [
    { source: `config:${result.id}`, target: `experiment:${result.id}`, type: 'CONFIGURES' },
  ]

  for (const [name, value] of Object.entries(result.metrics)) {
    const metricId = `metric:${name}`
    nodes.push({ id: metricId, type: 'metric', label: name, value })
    edges.push({ source: `experiment:${result.id}`, target: metricId, type: 'HAS_METRIC' })
  }

  for (const event of result.events) {
    const eventId = `event:${event.id}`
    nodes.push({
      id: eventId,
      type: 'timeline_event',
      label: event.label,
      day: event.day,
      minute: event.minute,
    })
    edges.push({ source: `experiment:${result.id}`, target: eventId, type: 'HAS_EVENT' })
  }

  let linkedFailures = 0
  const sourceEventNodes = new Set<string>()
  for (const failure of result.failures) {
    const failureId = `failure:${failure.id}`
    const sourceId = `source_event:${failure.sourceEventId}`
    nodes.push({
      id: failureId,
      type: 'ai_failure',
      label: failure.type,
      patientId: failure.patientId,
      verification: failure.verification,
      detected: failure.detected,
    })
    if (!sourceEventNodes.has(sourceId)) {
      nodes.push({ id: sourceId, type: 'source_event', label: failure.sourceEventId })
      sourceEventNodes.add(sourceId)
    }
    edges.push({ source: `experiment:${result.id}`, target: failureId, type: 'HAS_FAILURE' })
    edges.push({ source: failureId, target: sourceId, type: 'SUPPORTED_BY_SOURCE_EVENT' })
    linkedFailures += 1
  }

  return {
    schemaVersion: 'remote_clinic.evidence_graph.v1',
    experimentId: result.id,
    nodes,
    edges,
    coverage: {
      metricCount: Object.keys(result.metrics).length,
      eventCount: result.events.length,
      failureCount: result.failures.length,
      linkedFailures,
    },
    reviewGate: {
      status: 'simulation_only',
      realWorldUse: false,
      reasons: ['synthetic_patients', 'simulation_metrics_only', 'not_clinical_decision_support'],
    },
  }
}

export function exportValidationReport(report: ValidationReport, format: 'json' | 'markdown' = 'json'): string {
  if (format === 'json') return JSON.stringify(report, null, 2)
  return [
    '# Remote Clinic Validation Report',
    '',
    `Status: ${report.passed ? 'PASS' : 'FAIL'}`,
    `Seed: ${report.seed}`,
    '',
    '## Gates',
    '',
    '| Gate | Status | Observed | Expected |',
    '|---|---|---:|---|',
    ...report.gates.map((item) => {
      return `| ${item.name} | ${item.passed ? 'PASS' : 'FAIL'} | ${String(item.observed)} | ${String(item.expected)} |`
    }),
    '',
    '## Interpretation',
    '',
    report.interpretation,
  ].join('\n')
}

function gate(
  name: string,
  passed: boolean,
  observed: string | number | boolean,
  expected: string | number | boolean,
): ValidationGate {
  return { name, passed, observed, expected }
}

function parsesJson(value: string): boolean {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

function metricsAreNonnegativeFinite(metrics: ExperimentMetrics): boolean {
  return Object.values(metrics).every((value) => Number.isFinite(value) && value >= 0)
}
