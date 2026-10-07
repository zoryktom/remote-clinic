import type { ConnectivityState, ResourceState, WeatherState } from './types'

export function createInitialResources(): ResourceState {
  return {
    staff: {
      clinicians: 1,
      nurses: 2,
      technicians: 1,
      communityHealthWorkers: 1,
      administrators: 1,
      workload: 38,
    },
    supplies: {
      medications: 72,
      testKits: 44,
      ppe: 86,
      fuel: 58,
      labReagents: 36,
    },
    facility: {
      examRooms: 2,
      labCapacity: 10,
      waitingCapacity: 12,
      beds: 2,
      storage: 64,
    },
    technology: {
      computers: 4,
      localAiServer: true,
      batteryKwh: 72,
      networkTower: true,
      offlineCache: true,
    },
    transport: {
      vehicles: 1,
      roadOpen: true,
      averageTravelMinutes: 34,
      delayedPatients: 2,
    },
    budget: 36000,
    powerPercent: 84,
    computingLoad: 42,
  }
}

export function deriveConnectivity(weather: WeatherState, day: number): ConnectivityState {
  if (weather === 'SEVERE_STORM') return 'OFFLINE'
  if (weather === 'STORM') return day % 2 === 0 ? 'UNSTABLE' : 'LIMITED'
  if (weather === 'SNOW') return day % 3 === 0 ? 'LIMITED' : 'ONLINE'
  if (weather === 'RAIN') return day % 4 === 0 ? 'UNSTABLE' : 'ONLINE'
  return 'ONLINE'
}

export function adjustResourcesForDay(
  resources: ResourceState,
  weather: WeatherState,
  connectivity: ConnectivityState,
  aiEnabled: boolean,
): ResourceState {
  const next: ResourceState = structuredClone(resources)
  const stormPenalty = weather === 'SEVERE_STORM' ? 18 : weather === 'STORM' ? 10 : weather === 'SNOW' ? 6 : 2
  const aiPowerCost = aiEnabled ? 7 : 1
  const labUse = Math.min(next.supplies.labReagents, next.facility.labCapacity)

  next.powerPercent = clamp(next.powerPercent - stormPenalty - aiPowerCost + 4, 0, 100)
  next.supplies.testKits = clamp(next.supplies.testKits - Math.ceil(labUse / 2), 0, 200)
  next.supplies.medications = clamp(next.supplies.medications - 4, 0, 200)
  next.supplies.ppe = clamp(next.supplies.ppe - 5, 0, 200)
  next.supplies.fuel = clamp(next.supplies.fuel - (weather === 'SEVERE_STORM' ? 9 : 3), 0, 200)
  next.supplies.labReagents = clamp(next.supplies.labReagents - Math.ceil(labUse / 3), 0, 200)
  next.transport.roadOpen = weather !== 'SEVERE_STORM'
  next.transport.averageTravelMinutes = next.transport.roadOpen
    ? weather === 'CLEAR'
      ? 32
      : 48
    : 120
  next.transport.delayedPatients =
    connectivity === 'OFFLINE' || !next.transport.roadOpen
      ? next.transport.delayedPatients + 4
      : Math.max(0, next.transport.delayedPatients - 1)
  next.computingLoad = clamp(aiEnabled ? next.computingLoad + 9 : next.computingLoad - 4, 8, 100)
  next.staff.workload = clamp(
    next.staff.workload +
      (connectivity === 'OFFLINE' ? 12 : 4) +
      (next.transport.delayedPatients > 5 ? 8 : 0) -
      next.staff.communityHealthWorkers,
    0,
    100,
  )
  next.budget = Math.max(0, next.budget - 720 - (aiEnabled ? 110 : 0) - (weather === 'SEVERE_STORM' ? 960 : 0))

  return next
}

export function resourceCapacity(resources: ResourceState, connectivity: ConnectivityState): number {
  const staffCapacity =
    resources.staff.clinicians * 9 +
    resources.staff.nurses * 5 +
    resources.staff.communityHealthWorkers * 3 +
    resources.staff.technicians * 2
  const roomCapacity = resources.facility.examRooms * 8
  const supplyCapacity = Math.floor(
    Math.min(resources.supplies.medications, resources.supplies.testKits + resources.supplies.labReagents) / 4,
  )
  const connectivityPenalty = connectivity === 'OFFLINE' ? 6 : connectivity === 'UNSTABLE' ? 3 : 0
  const powerPenalty = resources.powerPercent < 25 ? 5 : 0
  return Math.max(3, Math.min(staffCapacity, roomCapacity + supplyCapacity) - connectivityPenalty - powerPenalty)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}
