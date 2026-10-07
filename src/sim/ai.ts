import type { AiFailure, AiState, CareGap, Patient, ResearchAnswer, TimelineEvent } from './types'

export function createInitialAiState(): AiState {
  return {
    enabled: true,
    mode: 'LOCAL_STRUCTURED',
    model: 'Structured Rules',
    quality: 'Medium',
    powerCost: 7,
    failures: [],
    metrics: {
      queries: 0,
      supportedStatements: 0,
      unsupportedStatements: 0,
      errorsDetected: 0,
      errorsMissed: 0,
      verificationRate: 0,
      latencyMs: 42,
      ramGb: 1,
      cpuPercent: 18,
    },
  }
}

export function summarizePatientWithEvidence(patient: Patient, careGaps: CareGap[]): ResearchAnswer {
  const patientGaps = careGaps.filter((gap) => gap.patientId === patient.id && gap.status === 'open')
  const evidence = [
    `Patient ${patient.id} has ${patient.timeline.length} synthetic timeline events.`,
    ...patientGaps.slice(0, 3).map((gap) => `${gap.id}: ${gap.type}; evidence ${gap.relatedEventIds.join(', ')}.`),
  ]

  return {
    question: `Summarize ${patient.id}`,
    answer:
      patientGaps.length > 0
        ? `${patient.name} has ${patientGaps.length} open simulated workflow gaps. Human review is required before taking action.`
        : `${patient.name} has no currently open simulated care gap in this run.`,
    evidence,
    sourceEvents: patient.timeline.slice(0, 5).map((event) => event.id),
    confidence: patientGaps.length > 0 ? 'High' : 'Moderate',
    limitations: 'Structured local summary only. This is not medical advice and does not diagnose the patient.',
  }
}

export function makeAiFailure(index: number, patient: Patient): AiFailure {
  const sourceEvent = patient.timeline[0]
  const temporalEvent = patient.timeline.find((event) => event.type === 'referral') ?? sourceEvent

  return {
    id: `AIF${String(index).padStart(3, '0')}`,
    type: index % 2 === 0 ? 'Temporal' : 'Missing context',
    patientId: patient.id,
    sourceEventId: temporalEvent.id,
    output:
      index % 2 === 0
        ? 'Clinic AI treated an older simulated referral as if it were completed today.'
        : 'Clinic AI omitted the transportation barrier from its summary.',
    evidence: `Source event ${temporalEvent.id}: ${temporalEvent.label}`,
    verification: index % 3 === 0 ? 'UNSUPPORTED' : 'PARTIALLY_SUPPORTED',
    detected: index % 4 !== 0,
    corrected: index % 4 !== 0,
    severity: index % 2 === 0 ? 'High' : 'Moderate',
  }
}

export function answerStructuredQuestion(
  question: string,
  patients: Patient[],
  careGaps: CareGap[],
  events: TimelineEvent[],
  failures: AiFailure[],
): ResearchAnswer {
  const normalized = question.toLowerCase()
  const openGaps = careGaps.filter((gap) => gap.status === 'open')
  const referralGaps = openGaps.filter((gap) => gap.type === 'Referral incomplete')
  const transportGaps = openGaps.filter((gap) => gap.type === 'Transportation barrier')
  const aiErrors = failures.filter((failure) => failure.verification === 'UNSUPPORTED' || failure.type === 'Temporal')

  if (normalized.includes('unresolved') || normalized.includes('care gap') || normalized.includes('care gaps')) {
    return {
      question,
      answer: `${openGaps.length} simulated care gaps are currently unresolved.`,
      evidence: openGaps.slice(0, 5).map((gap) => `${gap.id}: ${gap.type} for ${gap.patientId}.`),
      sourceEvents: openGaps.flatMap((gap) => gap.relatedEventIds).slice(0, 8),
      confidence: 'High',
      limitations: 'Counts come from the synthetic care-gap engine in the current save.',
    }
  }

  if (normalized.includes('referral')) {
    return {
      question,
      answer: `${referralGaps.length} simulated referral workflows are incomplete.`,
      evidence: referralGaps.slice(0, 5).map((gap) => `${gap.id}: ${gap.evidence.join(' ')}`),
      sourceEvents: referralGaps.flatMap((gap) => gap.relatedEventIds).slice(0, 8),
      confidence: 'High',
      limitations: 'Referral completion is a simulated workflow field, not a real clinical record.',
    }
  }

  if (normalized.includes('transport')) {
    return {
      question,
      answer: `${transportGaps.length} patients currently have transportation-related simulated workflow barriers.`,
      evidence: transportGaps.slice(0, 5).map((gap) => `${gap.id}: patient ${gap.patientId}.`),
      sourceEvents: transportGaps.flatMap((gap) => gap.relatedEventIds).slice(0, 8),
      confidence: 'High',
      limitations: 'Association is observed inside the simulation and does not imply real-world causation.',
    }
  }

  if (normalized.includes('ai') || normalized.includes('error') || normalized.includes('failure')) {
    return {
      question,
      answer: `${aiErrors.length} AI failure events are currently available for inspection.`,
      evidence: aiErrors.slice(0, 5).map((failure) => `${failure.id}: ${failure.type}; ${failure.verification}.`),
      sourceEvents: aiErrors.map((failure) => failure.sourceEventId).slice(0, 8),
      confidence: failures.length > 0 ? 'High' : 'Moderate',
      limitations: 'Failures are deliberately simulated to teach verification of AI-assisted workflow summaries.',
    }
  }

  const patientId = normalized.match(/p\d{3}/i)?.[0]?.toUpperCase()
  if (patientId) {
    const patient = patients.find((candidate) => candidate.id === patientId)
    if (patient) return summarizePatientWithEvidence(patient, careGaps)
  }

  return {
    question,
    answer: `The structured researcher found ${patients.length} synthetic patients, ${openGaps.length} open care gaps, and ${events.length} logged simulation events.`,
    evidence: events.slice(-5).map((event) => `${event.id}: Day ${event.day} ${event.label}`),
    sourceEvents: events.slice(-8).map((event) => event.id),
    confidence: 'Moderate',
    limitations: 'Question did not match a specialized query template, so this is a structured overview.',
  }
}
