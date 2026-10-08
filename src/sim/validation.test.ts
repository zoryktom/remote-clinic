import { describe, expect, it } from 'vitest'
import { exportExperiment, makeDefaultExperimentConfigs, runExperiment } from './clinicSimulation'
import { buildExperimentEvidenceGraph, exportValidationReport, runValidationSuite } from './validation'

describe('simulation validation suite', () => {
  it('validates the default offline A/B experiment pair', () => {
    const results = makeDefaultExperimentConfigs('REMOTE-VALIDATE').map((config) =>
      runExperiment({ ...config, runs: 2, durationDays: 6 }),
    )
    const report = runValidationSuite(results, 'REMOTE-VALIDATE')

    expect(report.schemaVersion).toBe('remote_clinic.validation_report.v1')
    expect(report.passed).toBe(true)
    expect(report.gates.every((gate) => gate.passed)).toBe(true)
    expect(exportValidationReport(report, 'markdown')).toContain('Remote Clinic Validation Report')
  })

  it('exports an experiment evidence graph with source-linked failures', () => {
    const [, config] = makeDefaultExperimentConfigs('REMOTE-GRAPH')
    const result = runExperiment({ ...config, runs: 1, durationDays: 4 })
    const graph = buildExperimentEvidenceGraph(result)

    expect(graph.schemaVersion).toBe('remote_clinic.evidence_graph.v1')
    expect(graph.coverage.metricCount).toBeGreaterThan(0)
    expect(graph.coverage.linkedFailures).toBe(graph.coverage.failureCount)
    expect(graph.reviewGate.realWorldUse).toBe(false)
    expect(JSON.parse(exportExperiment(result, 'json')).id).toBe(result.id)
  })
})
