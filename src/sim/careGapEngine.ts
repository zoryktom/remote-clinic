import { makeId } from './random'
import type { CareGap, CareGapType, Patient, Priority, TimelineEvent } from './types'

const typeSeverity: Record<CareGapType, Priority> = {
  'Referral incomplete': 'High',
  'Follow-up overdue': 'Moderate',
  'Abnormal result pending': 'High',
  'Medication reconciliation': 'Moderate',
  'Transportation barrier': 'Moderate',
  'Preventive task due': 'Low',
}

export function detectCareGaps(patients: Patient[], day: number): CareGap[] {
  const gaps: CareGap[] = []
  let index = 1

  for (const patient of patients) {
    const eventTypes = new Set(patient.timeline.map((event) => event.type))
    const referralEvents = patient.timeline.filter((event) => event.type === 'referral')
    const labEvents = patient.timeline.filter((event) => event.type === 'lab')
    const medicationEvents = patient.timeline.filter((event) => event.type === 'medication')
    const missedEvents = patient.timeline.filter((event) => event.type === 'missed_appointment')

    for (const referral of referralEvents) {
      gaps.push(
        makeGap(index, patient, 'Referral incomplete', day, [
          referral.id,
          ...related(missedEvents, referral.id),
        ]),
      )
      index += 1
    }

    for (const lab of labEvents) {
      if (!eventTypes.has('outreach')) {
        gaps.push(makeGap(index, patient, 'Abnormal result pending', day, [lab.id]))
        index += 1
      }
    }

    if (patient.followUpHistory !== 'complete') {
      gaps.push(
        makeGap(
          index,
          patient,
          'Follow-up overdue',
          day,
          patient.timeline.slice(0, 2).map((event) => event.id),
        ),
      )
      index += 1
    }

    for (const medication of medicationEvents) {
      gaps.push(makeGap(index, patient, 'Medication reconciliation', day, [medication.id]))
      index += 1
    }

    if (patient.transportation !== 'available') {
      gaps.push(
        makeGap(
          index,
          patient,
          'Transportation barrier',
          day,
          missedEvents.length > 0 ? missedEvents.map((event) => event.id) : [patient.timeline[0]?.id],
        ),
      )
      index += 1
    }

    if (patient.symptoms.includes('screening reminder')) {
      gaps.push(makeGap(index, patient, 'Preventive task due', day, [patient.timeline[0]?.id]))
      index += 1
    }
  }

  return gaps.filter((gap, index, all) => {
    const key = `${gap.patientId}:${gap.type}:${gap.relatedEventIds.join(',')}`
    return all.findIndex((candidate) => {
      return `${candidate.patientId}:${candidate.type}:${candidate.relatedEventIds.join(',')}` === key
    }) === index
  })
}

export function summarizeCareGap(gap: CareGap, patient: Patient): string {
  return `${gap.type} for ${patient.name} (${patient.id}); severity ${gap.severity}; evidence ${gap.relatedEventIds.join(', ')}.`
}

function makeGap(
  index: number,
  patient: Patient,
  type: CareGapType,
  day: number,
  relatedEventIds: Array<string | undefined>,
): CareGap {
  const events = relatedEventIds
    .filter(Boolean)
    .map((id) => patient.timeline.find((event) => event.id === id))
    .filter((event): event is TimelineEvent => Boolean(event))

  return {
    id: makeId('CG', index),
    patientId: patient.id,
    type,
    createdDay: day,
    status: 'open',
    severity: typeSeverity[type],
    evidence: events.map((event) => `Day ${event.day}: ${event.label}`),
    relatedEventIds: events.map((event) => event.id),
  }
}

function related(events: TimelineEvent[], targetId: string): string[] {
  return events
    .filter((event) => event.relatedIds.includes(targetId))
    .map((event) => event.id)
}
