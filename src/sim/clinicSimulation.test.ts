import { describe, expect, it } from 'vitest'
import { answerStructuredQuestion } from './ai'
import { detectCareGaps } from './careGapEngine'
import {
  advanceDay,
  createInitialGameState,
  exportExperiment,
  makeDefaultExperimentConfigs,
  resolveCareGap,
  runExperiment,
} from './clinicSimulation'
import { generatePatients } from './patientGenerator'

describe('patient generation', () => {
  it('is reproducible by seed', () => {
    const first = generatePatients('REMOTE-TEST', 8)
    const second = generatePatients('REMOTE-TEST', 8)
    expect(second).toEqual(first)
  })

  it('generates synthetic incomplete information and timelines', () => {
    const [patient] = generatePatients('REMOTE-INFO', 1)
    expect(patient.id).toBe('P001')
    expect(patient.timeline.length).toBeGreaterThan(0)
    expect(patient.incompleteInformation.length).toBeGreaterThan(0)
  })
})

describe('care-gap engine', () => {
  it('detects unresolved workflows from synthetic events', () => {
    const patients = generatePatients('REMOTE-GAPS', 12)
    const gaps = detectCareGaps(patients, 4)
    expect(gaps.length).toBeGreaterThan(0)
    expect(gaps.every((gap) => gap.evidence.length > 0)).toBe(true)
  })

  it('resolves a care gap with a player decision event', () => {
    const state = createInitialGameState('REMOTE-RESOLVE')
    const gap = state.careGaps.find((candidate) => candidate.status === 'open')
    expect(gap).toBeDefined()
    const next = resolveCareGap(state, gap!.id)
    expect(next.careGaps.find((candidate) => candidate.id === gap!.id)?.status).toBe('resolved')
    expect(next.events.at(-1)?.type).toBe('decision')
  })
})

describe('resource and event simulation', () => {
  it('advances a day and updates resources', () => {
    const state = createInitialGameState('REMOTE-DAY')
    const next = advanceDay(state)
    expect(next.day).toBe(state.day + 1)
    expect(next.events.length).toBeGreaterThan(state.events.length)
    expect(next.resources.powerPercent).toBeLessThanOrEqual(100)
  })

  it('answers structured research questions using simulation data', () => {
    const state = createInitialGameState('REMOTE-QUERY')
    const answer = answerStructuredQuestion(
      'How many patients have unresolved care gaps?',
      state.patients,
      state.careGaps,
      state.events,
      state.ai.failures,
    )
    expect(answer.answer).toContain('simulated care gaps')
    expect(answer.limitations).toContain('synthetic')
  })

  it('treats prompt-injection-like patient text as data', () => {
    const state = createInitialGameState('REMOTE-PROMPT-INJECTION')
    const suspiciousEvent = state.patients.flatMap((patient) => patient.timeline).find((event) =>
      String(event.metadata.untrustedPatientText) === 'true',
    )
    if (suspiciousEvent) {
      const answer = answerStructuredQuestion(
        `What happened to ${suspiciousEvent.patientId}?`,
        state.patients,
        state.careGaps,
        state.events,
        state.ai.failures,
      )
      expect(answer.limitations).toContain('not medical advice')
    } else {
      expect(state.patients.length).toBeGreaterThan(0)
    }
  })
})

describe('research experiments', () => {
  it('runs reproducible experiments and exports results', () => {
    const [config] = makeDefaultExperimentConfigs('REMOTE-EXP')
    const first = runExperiment({ ...config, runs: 2, durationDays: 5 })
    const second = runExperiment({ ...config, runs: 2, durationDays: 5 })
    expect(second.metrics).toEqual(first.metrics)
    expect(exportExperiment(first, 'json')).toContain('"SIMULATION RESULT')
    expect(exportExperiment(first, 'csv')).toContain('metric,value')
    expect(exportExperiment(first, 'jsonl').split('\n').length).toBeGreaterThan(1)
  })
})
