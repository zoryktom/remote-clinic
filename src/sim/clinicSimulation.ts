import { makeAiFailure, createInitialAiState } from './ai'
import { detectCareGaps } from './careGapEngine'
import { generatePatients } from './patientGenerator'
import { createRng, makeId } from './random'
import {
  adjustResourcesForDay,
  createInitialResources,
  deriveConnectivity,
  resourceCapacity,
} from './resources'
import type {
  AiFailure,
  CareGap,
  ExperimentConfig,
  ExperimentMetrics,
  ExperimentResult,
  GameState,
  ScoreState,
  TimelineEvent,
  WeatherState,
} from './types'

const softwareVersion = '0.2.0'

const weatherCycle: WeatherState[] = ['CLEAR', 'SNOW', 'RAIN', 'STORM', 'CLEAR', 'SEVERE_STORM']

export function createInitialGameState(seed = 'REMOTE-20491'): GameState {
  const patients = generatePatients(seed, 3)
  const careGaps = detectCareGaps(patients, 1).slice(0, 8)
  const ai = createInitialAiState()
  ai.failures = patients.slice(0, 2).map((patient, index) => makeAiFailure(index + 1, patient))
  ai.metrics = {
    ...ai.metrics,
    queries: 12,
    supportedStatements: 29,
    unsupportedStatements: 3,
    errorsDetected: ai.failures.filter((failure) => failure.detected).length,
    errorsMissed: ai.failures.filter((failure) => !failure.detected).length,
    verificationRate: 82,
  }

  const resources = createInitialResources()
  resources.staff = {
    ...resources.staff,
    clinicians: 1,
    nurses: 1,
    technicians: 1,
    communityHealthWorkers: 0,
    administrators: 0,
    workload: 18,
  }
  resources.supplies = {
    ...resources.supplies,
    medications: 90,
    testKits: 60,
    ppe: 90,
    fuel: 76,
    labReagents: 60,
  }
  resources.transport = {
    ...resources.transport,
    vehicles: 1,
    roadOpen: true,
    averageTravelMinutes: 28,
    delayedPatients: 0,
  }
  resources.powerPercent = 92
  resources.computingLoad = 18

  const events = buildInitialEvents(seed, patients.length)

  return {
    worldSeed: seed,
    simulationSeed: `${seed}-SIM`,
    day: 1,
    minute: 8 * 60 + 30,
    scenario: 'Scenario 1: Normal Day',
    weather: 'CLEAR',
    connectivity: 'ONLINE',
    patients,
    careGaps,
    resources,
    ai,
    events,
    score: calculateScore({
      careGaps,
      resources,
      aiFailures: ai.failures,
      patientsServed: 0,
      totalPatients: patients.length,
      cost: 0,
    }),
    experiments: [],
    selectedPatientId: patients[0]?.id ?? 'P001',
  }
}

export function advanceDay(state: GameState): GameState {
  const day = state.day + 1
  const rng = createRng(`${state.simulationSeed}:day:${day}`)
  const weather = rng.chance(0.18)
    ? 'SEVERE_STORM'
    : rng.chance(0.3)
      ? 'STORM'
      : weatherCycle[day % weatherCycle.length]
  const connectivity = deriveConnectivity(weather, day)
  const resources = adjustResourcesForDay(state.resources, weather, connectivity, state.ai.enabled)
  const capacity = resourceCapacity(resources, connectivity)
  const arrivals = Math.min(state.patients.length, Math.max(4, capacity + rng.integer(-2, 4)))
  const resolvedCount = Math.min(
    state.careGaps.filter((gap) => gap.status === 'open').length,
    Math.max(1, Math.floor(capacity / (state.ai.enabled ? 4 : 5))),
  )
  const careGaps = state.careGaps.map((gap, index) => {
    if (gap.status === 'open' && index < resolvedCount) {
      return {
        ...gap,
        status: 'resolved' as const,
        resolution: `Resolved by clinic workflow review on day ${day}.`,
      }
    }
    return gap
  })

  const newGaps = rng.chance(connectivity === 'OFFLINE' ? 0.8 : 0.35)
    ? detectCareGaps(state.patients, day)
        .slice(0, rng.integer(1, 3))
        .map((gap, index) => ({
          ...gap,
          id: makeId('CG', careGaps.length + index + 1),
          createdDay: day,
        }))
    : []
  const mergedGaps = [...careGaps, ...newGaps]
  const failures = maybeAddAiFailure(state.ai.failures, state.patients, day, state.ai.enabled, rng.chance(0.45))
  const ai = {
    ...state.ai,
    failures,
    metrics: {
      ...state.ai.metrics,
      queries: state.ai.metrics.queries + (state.ai.enabled ? arrivals : 0),
      supportedStatements: state.ai.metrics.supportedStatements + (state.ai.enabled ? resolvedCount * 2 : 0),
      unsupportedStatements:
        state.ai.metrics.unsupportedStatements + (failures.length > state.ai.failures.length ? 1 : 0),
      errorsDetected: failures.filter((failure) => failure.detected).length,
      errorsMissed: failures.filter((failure) => !failure.detected).length,
      verificationRate: Math.round(
        (failures.filter((failure) => failure.detected).length / Math.max(1, failures.length)) * 100,
      ),
      latencyMs: state.ai.enabled ? 44 + resources.computingLoad : 0,
      ramGb: state.ai.enabled ? 2 : 0,
      cpuPercent: state.ai.enabled ? resources.computingLoad : 4,
    },
  }

  const events = [
    ...state.events,
    event(
      makeId('EV', state.events.length + 1),
      day,
      8 * 60,
      'weather',
      'Environment',
      weather === 'SEVERE_STORM' ? 'Severe storm begins; roads and network degrade.' : `${weather} conditions logged.`,
      { weather },
    ),
    event(
      makeId('EV', state.events.length + 2),
      day,
      10 * 60 + 3,
      'resource',
      'Clinic Operations',
      `${arrivals} patients served with ${connectivity} connectivity.`,
      { arrivals, connectivity, capacity },
    ),
    event(
      makeId('EV', state.events.length + 3),
      day,
      14 * 60 + 20,
      'decision',
      'Player',
      `${resolvedCount} care gaps resolved through evidence review.`,
      { resolvedCount, aiEnabled: ai.enabled },
    ),
  ]

  const score = calculateScore({
    careGaps: mergedGaps,
    resources,
    aiFailures: ai.failures,
    patientsServed: arrivals,
    totalPatients: state.patients.length,
    cost: state.resources.budget - resources.budget,
  })

  return {
    ...state,
    day,
    minute: 17 * 60,
    weather,
    connectivity,
    careGaps: mergedGaps,
    resources,
    ai,
    events,
    score,
  }
}

export function resolveCareGap(state: GameState, careGapId: string): GameState {
  const careGaps = state.careGaps.map((gap) =>
    gap.id === careGapId
      ? {
          ...gap,
          status: 'resolved' as const,
          resolution: `Resolved by player evidence review on day ${state.day}.`,
        }
      : gap,
  )
  const events = [
    ...state.events,
    event(
      makeId('EV', state.events.length + 1),
      state.day,
      state.minute,
      'decision',
      'Player',
      `Care gap ${careGapId} resolved after source-event review.`,
      { careGapId, humanReviewed: true },
    ),
  ]
  return {
    ...state,
    careGaps,
    events,
    score: calculateScore({
      careGaps,
      resources: state.resources,
      aiFailures: state.ai.failures,
      patientsServed: 18,
      totalPatients: state.patients.length,
      cost: 0,
    }),
  }
}

export function runExperiment(config: ExperimentConfig): ExperimentResult {
  const runMetrics: ExperimentMetrics[] = []
  const allEvents: TimelineEvent[] = []
  const allFailures: AiFailure[] = []

  for (let run = 0; run < config.runs; run += 1) {
    let state = createInitialGameState(`${config.seed}-RUN-${run + 1}`)
    state = applyExperimentConfig(state, config)

    const baselineBudget = state.resources.budget
    let patientsServed = 0
    let downtimeDays = 0
    let powerStart = state.resources.powerPercent

    for (let day = 0; day < config.durationDays; day += 1) {
      state = advanceDay(state)
      patientsServed += resourceCapacity(state.resources, state.connectivity)
      if (state.connectivity === 'OFFLINE' || state.connectivity === 'UNSTABLE') downtimeDays += 1
    }

    const open = state.careGaps.filter((gap) => gap.status === 'open').length
    const resolved = state.careGaps.filter((gap) => gap.status === 'resolved').length
    runMetrics.push({
      patientsServed,
      careGapsCreated: state.careGaps.length,
      careGapsResolved: resolved,
      averageWaitMinutes: Math.round(28 + open * 1.8 + state.resources.staff.workload / 3),
      resourceUtilization: state.resources.staff.workload,
      aiQueries: state.ai.metrics.queries,
      aiErrors: state.ai.failures.length,
      connectivityDowntime: Math.round((downtimeDays / config.durationDays) * 100),
      powerUsed: Math.max(0, powerStart - state.resources.powerPercent),
      staffWorkload: state.resources.staff.workload,
      cost: baselineBudget - state.resources.budget,
    })
    allEvents.push(...state.events.slice(-12))
    allFailures.push(...state.ai.failures)
    powerStart = state.resources.powerPercent
  }

  return {
    id: config.id,
    config,
    metrics: averageMetrics(runMetrics),
    events: allEvents,
    failures: allFailures,
    reproducibility: {
      simulationId: `RUN-${config.id}-${config.seed}`,
      seed: config.seed,
      softwareVersion,
      generatedAt: new Date().toISOString(),
      note: 'SIMULATION RESULT. Synthetic patients only. No clinical validity claimed.',
    },
  }
}

export function makeDefaultExperimentConfigs(seed: string): [ExperimentConfig, ExperimentConfig] {
  return [
    {
      id: 'A-NOAI-OFFLINE',
      label: 'Scenario A: Offline, no AI',
      seed,
      population: 50,
      staff: 2,
      connectivity: 'OFFLINE',
      aiEnabled: false,
      power: 64,
      transportation: 'limited',
      supplies: 'constrained',
      weather: 'SNOW',
      durationDays: 30,
      runs: 5,
    },
    {
      id: 'B-LOCALAI-OFFLINE',
      label: 'Scenario B: Offline, local AI',
      seed,
      population: 50,
      staff: 2,
      connectivity: 'OFFLINE',
      aiEnabled: true,
      power: 64,
      transportation: 'limited',
      supplies: 'constrained',
      weather: 'SNOW',
      durationDays: 30,
      runs: 5,
    },
  ]
}

export function exportExperiment(result: ExperimentResult, format: 'json' | 'csv' | 'jsonl' | 'markdown'): string {
  if (format === 'json') return JSON.stringify(result, null, 2)
  if (format === 'jsonl') {
    return result.events
      .map((item) => JSON.stringify({ experimentId: result.id, type: 'event', item }))
      .concat(result.failures.map((item) => JSON.stringify({ experimentId: result.id, type: 'failure', item })))
      .join('\n')
  }
  if (format === 'csv') {
    const rows = [
      'metric,value',
      ...Object.entries(result.metrics).map(([key, value]) => `${key},${value}`),
    ]
    return rows.join('\n')
  }
  return [
    `# ${result.config.label}`,
    '',
    '**SIMULATION RESULT**',
    '',
    `Seed: ${result.config.seed}`,
    `Duration: ${result.config.durationDays} days`,
    `Runs: ${result.config.runs}`,
    '',
    '## Metrics',
    '',
    ...Object.entries(result.metrics).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## Limitations',
    '',
    'Synthetic patients only. This does not establish real-world clinical effectiveness.',
  ].join('\n')
}

function applyExperimentConfig(state: GameState, config: ExperimentConfig): GameState {
  const patients = generatePatients(config.seed, config.population)
  const careGaps = detectCareGaps(patients, 1)
  return {
    ...state,
    simulationSeed: config.seed,
    day: 1,
    weather: config.weather,
    connectivity: config.connectivity,
    patients,
    careGaps,
    resources: {
      ...state.resources,
      staff: {
        ...state.resources.staff,
        clinicians: Math.max(1, Math.floor(config.staff / 2)),
        nurses: config.staff,
        workload: 42,
      },
      supplies: {
        ...state.resources.supplies,
        medications: config.supplies === 'shortage' ? 24 : config.supplies === 'constrained' ? 48 : 90,
        testKits: config.supplies === 'shortage' ? 16 : config.supplies === 'constrained' ? 32 : 70,
        labReagents: config.supplies === 'shortage' ? 12 : config.supplies === 'constrained' ? 28 : 60,
      },
      transport: {
        ...state.resources.transport,
        vehicles: config.transportation === 'severe' ? 0 : 1,
        roadOpen: config.transportation !== 'severe',
        delayedPatients: config.transportation === 'normal' ? 1 : config.transportation === 'limited' ? 6 : 13,
      },
      powerPercent: config.power,
    },
    ai: {
      ...state.ai,
      enabled: config.aiEnabled,
      mode: config.aiEnabled ? 'LOCAL_STRUCTURED' : 'UNAVAILABLE',
    },
    events: [],
  }
}

function buildInitialEvents(seed: string, patientCount: number): TimelineEvent[] {
  return [
    event('EV001', 1, 8 * 60 + 30, 'weather', 'Environment', 'Normal clinic day begins with clear roads.', { seed }),
    event(
      'EV002',
      1,
      8 * 60 + 35,
      'infrastructure',
      'Network Tower',
      'Connectivity is stable. Referrals and result transmission are available.',
      { connectivity: 'ONLINE' },
    ),
    event(
      'EV003',
      1,
      8 * 60 + 40,
      'resource',
      'Reception',
      `${patientCount} patients are waiting for normal clinic workflow.`,
      { patientCount },
    ),
    event(
      'EV004',
      1,
      8 * 60 + 45,
      'ai_event',
      'Clinic AI',
      'Clinic Assistant is available for short workflow explanations.',
      { verification: 'SUPPORTED' },
    ),
  ]
}

function event(
  id: string,
  day: number,
  minute: number,
  type: TimelineEvent['type'],
  actor: string,
  label: string,
  metadata: TimelineEvent['metadata'],
): TimelineEvent {
  return {
    id,
    day,
    minute,
    type,
    source: 'simulation',
    actor,
    label,
    metadata,
    relatedIds: [],
  }
}

function maybeAddAiFailure(
  failures: AiFailure[],
  patients: GameState['patients'],
  day: number,
  aiEnabled: boolean,
  shouldAdd: boolean,
): AiFailure[] {
  if (!aiEnabled || !shouldAdd) return failures
  const patient = patients[day % patients.length]
  return [...failures, makeAiFailure(failures.length + 1, patient)]
}

function averageMetrics(metrics: ExperimentMetrics[]): ExperimentMetrics {
  const keys = Object.keys(metrics[0]) as Array<keyof ExperimentMetrics>
  return keys.reduce((output, key) => {
    output[key] = Math.round(metrics.reduce((sum, item) => sum + item[key], 0) / metrics.length)
    return output
  }, {} as ExperimentMetrics)
}

function calculateScore(input: {
  careGaps: CareGap[]
  resources: GameState['resources']
  aiFailures: AiFailure[]
  patientsServed: number
  totalPatients: number
  cost: number
}): ScoreState {
  const openGaps = input.careGaps.filter((gap) => gap.status === 'open').length
  const resolved = input.careGaps.filter((gap) => gap.status === 'resolved').length
  const access = clampScore((input.patientsServed / Math.max(1, input.totalPatients)) * 100)
  const workflow = clampScore((resolved / Math.max(1, resolved + openGaps)) * 100)
  const resourceEfficiency = clampScore(
    100 - (100 - input.resources.powerPercent) * 0.35 - input.resources.staff.workload * 0.25,
  )
  const aiVerification = clampScore(
    input.aiFailures.length === 0
      ? 100
      : (input.aiFailures.filter((failure) => failure.detected).length / input.aiFailures.length) * 100,
  )
  const followUp = clampScore(100 - openGaps * 2.2)
  const staffWorkload = clampScore(100 - input.resources.staff.workload)
  const cost = clampScore(100 - input.cost / 400)
  const overall = Math.round(
    (access + workflow + resourceEfficiency + aiVerification + followUp + staffWorkload + cost) / 7,
  )
  return {
    access,
    workflow,
    resourceEfficiency,
    aiVerification,
    followUp,
    staffWorkload,
    cost,
    overall,
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}
