export type ConnectivityState = 'ONLINE' | 'LIMITED' | 'UNSTABLE' | 'OFFLINE'
export type WeatherState = 'CLEAR' | 'RAIN' | 'SNOW' | 'STORM' | 'SEVERE_STORM'
export type Priority = 'Routine' | 'Low' | 'Moderate' | 'High' | 'Urgent'
export type CareGapStatus = 'open' | 'resolved' | 'deferred'
export type CareGapType =
  | 'Referral incomplete'
  | 'Follow-up overdue'
  | 'Abnormal result pending'
  | 'Medication reconciliation'
  | 'Transportation barrier'
  | 'Preventive task due'

export type TimelineEventType =
  | 'arrival'
  | 'encounter'
  | 'observation'
  | 'order'
  | 'lab'
  | 'referral'
  | 'appointment'
  | 'missed_appointment'
  | 'outreach'
  | 'medication'
  | 'ai_event'
  | 'resource'
  | 'infrastructure'
  | 'weather'
  | 'decision'
  | 'research'

export type AiVerification =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'UNCERTAIN'
  | 'UNSUPPORTED'
  | 'CONFLICTING'

export interface TimelineEvent {
  id: string
  day: number
  minute: number
  type: TimelineEventType
  source: string
  actor: string
  patientId?: string
  label: string
  metadata: Record<string, string | number | boolean>
  relatedIds: string[]
}

export interface Patient {
  id: string
  name: string
  age: number
  sex: string
  community: string
  symptoms: string[]
  history: string[]
  medications: string[]
  allergies: string[]
  riskFactors: string[]
  socialConstraints: string[]
  transportation: 'available' | 'limited' | 'unavailable'
  followUpHistory: 'complete' | 'incomplete' | 'unknown'
  priority: Priority
  incompleteInformation: string[]
  timeline: TimelineEvent[]
}

export interface CareGap {
  id: string
  patientId: string
  type: CareGapType
  createdDay: number
  status: CareGapStatus
  severity: Priority
  evidence: string[]
  relatedEventIds: string[]
  resolution?: string
}

export interface StaffState {
  clinicians: number
  nurses: number
  technicians: number
  communityHealthWorkers: number
  administrators: number
  workload: number
}

export interface SupplyState {
  medications: number
  testKits: number
  ppe: number
  fuel: number
  labReagents: number
}

export interface FacilityState {
  examRooms: number
  labCapacity: number
  waitingCapacity: number
  beds: number
  storage: number
}

export interface TechnologyState {
  computers: number
  localAiServer: boolean
  batteryKwh: number
  networkTower: boolean
  offlineCache: boolean
}

export interface TransportationState {
  vehicles: number
  roadOpen: boolean
  averageTravelMinutes: number
  delayedPatients: number
}

export interface ResourceState {
  staff: StaffState
  supplies: SupplyState
  facility: FacilityState
  technology: TechnologyState
  transport: TransportationState
  budget: number
  powerPercent: number
  computingLoad: number
}

export interface AiFailure {
  id: string
  type:
    | 'Hallucination'
    | 'Negation'
    | 'Temporal'
    | 'Missing context'
    | 'Contradiction'
    | 'Overconfidence'
  patientId: string
  sourceEventId: string
  output: string
  evidence: string
  verification: AiVerification
  detected: boolean
  corrected: boolean
  severity: Priority
}

export interface AiMetrics {
  queries: number
  supportedStatements: number
  unsupportedStatements: number
  errorsDetected: number
  errorsMissed: number
  verificationRate: number
  latencyMs: number
  ramGb: number
  cpuPercent: number
}

export interface AiState {
  enabled: boolean
  mode: 'LOCAL_STRUCTURED' | 'LOCAL_MODEL_OPTIONAL' | 'UNAVAILABLE'
  model: 'Structured Rules' | 'Local Model A' | 'Local Model B'
  quality: 'Medium' | 'High'
  powerCost: number
  failures: AiFailure[]
  metrics: AiMetrics
}

export interface ScoreState {
  access: number
  workflow: number
  resourceEfficiency: number
  aiVerification: number
  followUp: number
  staffWorkload: number
  cost: number
  overall: number
}

export interface ExperimentConfig {
  id: string
  label: string
  seed: string
  population: number
  staff: number
  connectivity: ConnectivityState
  aiEnabled: boolean
  power: number
  transportation: 'normal' | 'limited' | 'severe'
  supplies: 'stable' | 'constrained' | 'shortage'
  weather: WeatherState
  durationDays: number
  runs: number
}

export interface ExperimentMetrics {
  patientsServed: number
  careGapsCreated: number
  careGapsResolved: number
  averageWaitMinutes: number
  resourceUtilization: number
  aiQueries: number
  aiErrors: number
  connectivityDowntime: number
  powerUsed: number
  staffWorkload: number
  cost: number
}

export interface ExperimentResult {
  id: string
  config: ExperimentConfig
  metrics: ExperimentMetrics
  events: TimelineEvent[]
  failures: AiFailure[]
  reproducibility: {
    simulationId: string
    seed: string
    softwareVersion: string
    generatedAt: string
    note: string
  }
}

export interface ResearchAnswer {
  question: string
  answer: string
  evidence: string[]
  sourceEvents: string[]
  confidence: 'Low' | 'Moderate' | 'High'
  limitations: string
}

export interface GameState {
  worldSeed: string
  simulationSeed: string
  day: number
  minute: number
  scenario: string
  weather: WeatherState
  connectivity: ConnectivityState
  patients: Patient[]
  careGaps: CareGap[]
  resources: ResourceState
  ai: AiState
  events: TimelineEvent[]
  score: ScoreState
  experiments: ExperimentResult[]
  selectedPatientId: string
}
