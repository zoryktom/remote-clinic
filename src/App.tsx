import {
  Activity,
  AlertTriangle,
  Archive,
  BatteryCharging,
  Boxes,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Download,
  FlaskConical,
  HelpCircle,
  HeartPulse,
  Map,
  Pause,
  Play,
  RadioTower,
  Save,
  Server,
  Settings,
  ShieldAlert,
  Stethoscope,
  Users,
  Wifi,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import './App.css'
import { blockDefinitions, buildableBlocks } from './game/blocks'
import { RemoteClinicGame, type InteractionTarget } from './game/RemoteClinicGame'
import { answerStructuredQuestion, summarizePatientWithEvidence } from './sim/ai'
import {
  advanceDay,
  createInitialGameState,
  exportExperiment,
  makeDefaultExperimentConfigs,
  resolveCareGap,
  runExperiment,
} from './sim/clinicSimulation'
import { buildExperimentEvidenceGraph, exportValidationReport, runValidationSuite } from './sim/validation'
import type { ExperimentResult, GameState, Patient, ResearchAnswer } from './sim/types'

type ModalKind =
  | 'computer'
  | 'patient'
  | 'server'
  | 'generator'
  | 'cabinet'
  | 'research'
  | 'network'
  | 'vehicle'
  | 'bottlenecks'
  | null
type WorkflowStep = 0 | 1 | 2 | 3 | 4 | 5 | 6
type SpeedMode = 0 | 1 | 2 | 5

const saveKey = 'remote-clinic-save-v1'
const workflowSteps = ['Arrival', 'Triage', 'Provider', 'Lab / Test', 'Referral', 'Follow-up', 'Completed'] as const

const stepActionText = {
  0: {
    need: 'Patient needs arrival registration.',
    button: 'Register Patient',
    done: 'Patient registered',
  },
  1: {
    need: 'Patient needs triage.',
    button: 'Complete Triage',
    done: 'Triage completed',
  },
  2: {
    need: 'Patient needs provider evaluation.',
    button: 'Assign to Provider',
    done: 'Patient assigned to provider',
  },
  3: {
    need: 'Order laboratory testing.',
    button: 'Order Lab',
    done: 'Laboratory order submitted',
  },
  4: {
    need: 'Review laboratory result and prepare referral.',
    button: 'Review Result',
    done: 'Laboratory result reviewed',
  },
  5: {
    need: 'Schedule follow-up.',
    button: 'Schedule Follow-Up',
    done: 'Follow-up completed',
  },
  6: {
    need: 'Workflow complete.',
    button: 'Completed',
    done: 'Workflow already completed',
  },
} satisfies Record<WorkflowStep, { need: string; button: string; done: string }>

function App() {
  const [state, setState] = useState<GameState>(() => createInitialGameState())
  const [showTitle, setShowTitle] = useState(true)
  const [showHowTo, setShowHowTo] = useState(false)
  const [speed, setSpeed] = useState<SpeedMode>(0)
  const [target, setTarget] = useState<InteractionTarget | null>(null)
  const [modal, setModal] = useState<ModalKind>(null)
  const [selectedPatientId, setSelectedPatientId] = useState(state.selectedPatientId)
  const [workflowProgress, setWorkflowProgress] = useState<Record<string, WorkflowStep>>(() =>
    Object.fromEntries(state.patients.map((patient) => [patient.id, 2 as WorkflowStep])),
  )
  const [query, setQuery] = useState('Which patients have unresolved referrals?')
  const [answer, setAnswer] = useState<ResearchAnswer | null>(null)
  const [blockMessage, setBlockMessage] = useState('Selected White Wall Block.')
  const [feedback, setFeedback] = useState<Array<{ id: number; tone: 'good' | 'warn'; text: string }>>([
    { id: 1, tone: 'good', text: 'Normal day ready. Start with the work queue.' },
  ])
  const [showDisruption, setShowDisruption] = useState(false)
  const [pendingConnectivityScenario, setPendingConnectivityScenario] = useState(false)
  const [daySummary, setDaySummary] = useState<ReturnType<typeof makeDaySummary> | null>(null)
  const [exportText, setExportText] = useState('')
  const [exportName, setExportName] = useState('remote-clinic-export.json')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const gameRef = useRef<RemoteClinicGame | null>(null)
  const initialStateRef = useRef(state)

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return
    gameRef.current = new RemoteClinicGame(containerRef.current, initialStateRef.current, {
      onTargetChange: setTarget,
      onInteract: (interaction) => {
        if (interaction.id) setSelectedPatientId(interaction.id)
        if (interaction.kind !== 'none') setModal(interaction.kind)
        setShowTitle(false)
      },
      onBlockChange: setBlockMessage,
    })
    return () => {
      gameRef.current?.dispose()
      gameRef.current = null
    }
  }, [])

  useEffect(() => {
    gameRef.current?.updateState(state)
  }, [state])

  useEffect(() => {
    if (feedback.length <= 4) return
    const timer = window.setTimeout(() => {
      setFeedback((current) => current.slice(-4))
    }, 400)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const selectedPatient = useMemo(
    () => state.patients.find((patient) => patient.id === selectedPatientId) ?? state.patients[0],
    [selectedPatientId, state.patients],
  )

  const clinicStatus = useMemo(() => getClinicStatus(state, workflowProgress), [state, workflowProgress])
  const workQueue = useMemo(() => makeWorkQueue(state, workflowProgress), [state, workflowProgress])
  const objective = useMemo(() => getCurrentObjective(state, workflowProgress), [state, workflowProgress])
  const bottlenecks = useMemo(() => getBottlenecks(state, workflowProgress), [state, workflowProgress])
  const experiment = state.experiments.at(-1)
  const downloadUrl = useMemo(() => {
    if (!exportText) return ''
    return URL.createObjectURL(new Blob([exportText], { type: 'text/plain' }))
  }, [exportText])

  const handleQuery = () => {
    setAnswer(answerStructuredQuestion(query, state.patients, state.careGaps, state.events, state.ai.failures))
  }

  const addFeedback = (text: string, tone: 'good' | 'warn' = 'good') => {
    setFeedback((current) => [...current.slice(-3), { id: Date.now() + Math.random(), tone, text }])
  }

  const startDay = () => {
    setShowTitle(false)
    setShowHowTo(true)
    setSpeed(0)
    addFeedback('Start with the work queue: pick a patient and complete their next action.')
  }

  const selectPatientForWork = (patientId: string) => {
    setSelectedPatientId(patientId)
    setModal('patient')
    setShowTitle(false)
  }

  const completeNextAction = (patientId: string) => {
    const patient = state.patients.find((candidate) => candidate.id === patientId)
    if (!patient) return
    const step = workflowProgress[patientId] ?? 2
    if (step >= 6) {
      addFeedback('Patient workflow already completed.')
      return
    }
    const nextStep = Math.min(6, step + 1) as WorkflowStep
    setWorkflowProgress((current) => ({ ...current, [patientId]: nextStep }))
    const action = stepActionText[step]
    addFeedback(`✓ ${action.done} for ${patient.name}.`)

    setState((current) => {
      const patientOpenGap = current.careGaps.find((gap) => gap.patientId === patientId && gap.status === 'open')
      const shouldResolveGap = nextStep === 6 && patientOpenGap
      const careGaps = current.careGaps.map((gap) =>
        shouldResolveGap && gap.id === patientOpenGap.id
          ? {
              ...gap,
              status: 'resolved' as const,
              resolution: `Resolved by completing the patient workflow on day ${current.day}.`,
            }
          : gap,
      )
      return {
        ...current,
        careGaps,
        minute: Math.min(17 * 60, current.minute + 18),
        resources: {
          ...current.resources,
          staff: {
            ...current.resources.staff,
            workload: Math.min(100, current.resources.staff.workload + (nextStep === 3 ? 3 : 1)),
          },
          supplies: {
            ...current.resources.supplies,
            testKits: nextStep === 4 ? Math.max(0, current.resources.supplies.testKits - 1) : current.resources.supplies.testKits,
            labReagents:
              nextStep === 4 ? Math.max(0, current.resources.supplies.labReagents - 1) : current.resources.supplies.labReagents,
          },
        },
        events: [
          ...current.events,
          {
            id: `UI-${current.events.length + 1}`,
            day: current.day,
            minute: current.minute,
            type: 'decision',
            source: 'player_action',
            actor: 'Player',
            patientId,
            label: action.done,
            metadata: { workflowStep: workflowSteps[nextStep], patient: patient.name },
            relatedIds: patientOpenGap ? [patientOpenGap.id] : [],
          },
        ],
      }
    })

    if (nextStep === 6) {
      addFeedback('✓ Patient workflow completed. Queue reduced.')
      const allComplete = state.patients.every((candidate) => {
        const candidateStep = candidate.id === patientId ? nextStep : workflowProgress[candidate.id] ?? 2
        return candidateStep >= 6
      })
      if (allComplete && state.scenario.includes('Normal Day')) {
        addFeedback('✓ Good decision. Normal day completed.')
      }
    }
  }

  const runDefaultResearch = () => {
    const [a, b] = makeDefaultExperimentConfigs(`${state.worldSeed}-EXP-${state.experiments.length + 1}`)
    const results = [runExperiment(a), runExperiment(b)]
    setState((current) => ({ ...current, experiments: [...current.experiments, ...results] }))
    setExportText(exportExperiment(results[1], 'markdown'))
    setExportName('remote-clinic-experiment.md')
  }

  const saveGame = () => {
    localStorage.setItem(saveKey, JSON.stringify(state))
    setBlockMessage('World saved locally.')
  }

  const loadGame = () => {
    const stored = localStorage.getItem(saveKey)
    if (!stored) {
      setBlockMessage('No local save found.')
      return
    }
    setState(JSON.parse(stored) as GameState)
    setWorkflowProgress({})
    setBlockMessage('Local save loaded.')
    setShowTitle(false)
  }

  const exportSave = () => {
    setExportText(JSON.stringify(state, null, 2))
    setExportName('remote-clinic-save.json')
    setModal('research')
  }

  const exportLatestExperiment = (format: 'json' | 'csv' | 'jsonl' | 'markdown') => {
    const result = state.experiments.at(-1)
    if (!result) return
    setExportText(exportExperiment(result, format))
    setExportName(`remote-clinic-experiment.${format === 'markdown' ? 'md' : format}`)
  }

  const exportLatestValidation = () => {
    const results = state.experiments.slice(-2)
    if (results.length < 2) return
    const report = runValidationSuite(results, `${state.worldSeed}-VALIDATION`)
    setExportText(exportValidationReport(report, 'markdown'))
    setExportName('remote-clinic-validation.md')
  }

  const exportLatestEvidenceGraph = () => {
    const result = state.experiments.at(-1)
    if (!result) return
    setExportText(JSON.stringify(buildExperimentEvidenceGraph(result), null, 2))
    setExportName('remote-clinic-evidence-graph.json')
  }

  const startConnectivityScenario = () => {
    setState((current) => ({
      ...current,
      scenario: 'Scenario 2: Connectivity Failure',
      day: current.day + 1,
      minute: 9 * 60,
      connectivity: 'OFFLINE',
      resources: {
        ...current.resources,
        staff: { ...current.resources.staff, workload: Math.min(100, current.resources.staff.workload + 14) },
        transport: { ...current.resources.transport, delayedPatients: current.resources.transport.delayedPatients + 2 },
      },
      events: [
        ...current.events,
        {
          id: `EV${current.events.length + 1}`,
          day: current.day + 1,
          minute: 9 * 60,
          type: 'infrastructure',
          source: 'simulation',
          actor: 'Network Tower',
          label: 'Connectivity failure: external referrals and result transmission may be delayed.',
          metadata: { connectivity: 'OFFLINE' },
          relatedIds: [],
        },
      ],
    }))
    setPendingConnectivityScenario(false)
    setShowDisruption(true)
    setSpeed(0)
    addFeedback('⚠ Connectivity failure introduced. Local clinic work can continue.', 'warn')
  }

  const handleAdvanceDay = () => {
    const summary = makeDaySummary(state, workflowProgress)
    setDaySummary(summary)
    if (state.scenario.includes('Normal Day') && Object.values(workflowProgress).every((step) => step >= 6)) {
      setPendingConnectivityScenario(true)
      return
    }
    setState((current) => advanceDay(current))
    addFeedback('Day advanced. Review the queue and bottlenecks.')
  }

  return (
    <main className={`app-shell ${showTitle ? 'is-opening' : ''}`}>
      <div ref={containerRef} className="game-canvas" aria-label="Remote Clinic 3D world" />

      <section className="hud top-hud" aria-label="Clinic status">
        <div className="brand-chip">
          <HeartPulse size={18} />
          <span>Remote Clinic</span>
        </div>
        <div className="objective-chip">
          <span>Current Objective</span>
          <strong>{objective}</strong>
        </div>
        <StatusItem icon={<CalendarClock size={16} />} label={`Day ${state.day}`} value={formatTime(state.minute)} />
        <StatusItem icon={<Wifi size={16} />} label="Internet" value={state.connectivity} tone={state.connectivity === 'OFFLINE' ? 'bad' : 'ok'} />
      </section>

      <section className={`hud clinic-status-panel ${clinicStatus.hasProblem ? 'warning' : ''}`} aria-label="Clinic status details">
        <div className="panel-heading">
          {clinicStatus.hasProblem ? <AlertTriangle size={18} /> : <ClipboardList size={18} />}
          <span>Clinic Status{clinicStatus.hasProblem ? ' ⚠' : ''}</span>
        </div>
        <dl>
          <div><dt>Patients waiting</dt><dd>{clinicStatus.waiting}</dd></div>
          <div><dt>Staff available</dt><dd>{clinicStatus.staffAvailable}/{clinicStatus.staffTotal}</dd></div>
          <div><dt>Lab queue</dt><dd>{clinicStatus.labQueue}</dd></div>
          <div><dt>Connectivity</dt><dd>{clinicStatus.connectivityPercent}%</dd></div>
          <div><dt>Unfinished tasks</dt><dd>{clinicStatus.unfinished}</dd></div>
        </dl>
        <p>{clinicStatus.whyCare}</p>
        <button type="button" onClick={() => setModal('bottlenecks')}>View Bottlenecks</button>
      </section>

      <div className="reticle" aria-hidden="true" />
      {target && (
        <button className="interaction-prompt" type="button" onClick={() => target.kind !== 'none' && setModal(target.kind)}>
          <span>E</span>
          {target.label}
        </button>
      )}

      <section className="hud left-panel" aria-label="Work queue">
        <div className="panel-heading">
          <ClipboardList size={18} />
          <span>Work Queue</span>
        </div>
        <p className="scenario-label">{state.scenario}</p>
        <div className="queue-list">
          {workQueue.map((item) => (
            <button key={item.patient.id} type="button" className={`queue-item ${item.tone}`} onClick={() => selectPatientForWork(item.patient.id)}>
              <span>{item.badge}</span>
              <strong>{item.patient.id}</strong>
              <em>{item.nextAction}</em>
            </button>
          ))}
        </div>
        <div className="score-ring" style={{ '--score': `${state.score.overall}%` } as CSSProperties & Record<'--score', string>}>
          <strong>{state.score.overall}</strong>
          <span>score</span>
        </div>
      </section>

      <section className="hud map-labels" aria-label="Clinic map labels">
        {areaLabels.map((area) => (
          <button
            key={area.label}
            type="button"
            className="map-label"
            style={{ left: area.left, top: area.top } as CSSProperties}
            onClick={() => {
              addFeedback(`${area.label}: ${area.happening}`)
              setModal(area.modal)
            }}
            title={`${area.what} ${area.action}`}
          >
            <strong>{area.label}</strong>
            <span>{area.happening}</span>
          </button>
        ))}
      </section>

      <section className="hud feedback-stack" aria-label="Feedback">
        {feedback.map((item) => (
          <div key={item.id} className={`feedback ${item.tone}`}>
            {item.tone === 'good' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{item.text}</span>
          </div>
        ))}
      </section>

      <section className="hud inventory-bar" aria-label="Build inventory">
        {buildableBlocks.map((id, index) => (
          <button key={id} type="button" className="inventory-slot" title={blockDefinitions[id].label}>
            <span>{index + 1}</span>
            <i style={{ background: blockDefinitions[id].color }} />
          </button>
        ))}
        <p>{blockMessage}</p>
      </section>

      <section className="hud action-dock" aria-label="Game actions">
        <IconButton label={speed === 0 ? 'Play simulation' : 'Pause simulation'} onClick={() => setSpeed((value) => (value === 0 ? 1 : 0))}>
          {speed === 0 ? <Play size={18} /> : <Pause size={18} />}
        </IconButton>
        <IconButton label="2x speed" onClick={() => setSpeed(2)}>
          <span className="speed-text">2×</span>
        </IconButton>
        <IconButton label="5x speed" onClick={() => setSpeed(5)}>
          <span className="speed-text">5×</span>
        </IconButton>
        <IconButton label="End day" onClick={handleAdvanceDay}>
          <Activity size={18} />
        </IconButton>
        <IconButton label="How to play" onClick={() => setShowHowTo(true)}>
          <HelpCircle size={18} />
        </IconButton>
        <IconButton label="Save world" onClick={saveGame}>
          <Save size={18} />
        </IconButton>
        <IconButton label="Load world" onClick={loadGame}>
          <Archive size={18} />
        </IconButton>
        <IconButton label="Export save" onClick={exportSave}>
          <Download size={18} />
        </IconButton>
        <IconButton label="Settings" onClick={() => setModal('network')}>
          <Settings size={18} />
        </IconButton>
      </section>

      {showTitle && (
        <section className="title-overlay" aria-label="Remote Clinic title">
          <div className="title-copy">
            <p>A Healthcare Simulation Under Constraints</p>
            <h1>Remote Clinic</h1>
            <span>You're running a small healthcare clinic in a remote community. Keep patients moving despite limited resources and unreliable infrastructure.</span>
            <div className="goal-flow">
              <strong>Your Goal</strong>
              <p>Patient → Provider → Lab/Testing → Referral → Follow-up</p>
            </div>
          </div>
          <div className="title-actions">
            <button type="button" onClick={startDay}>Start Day</button>
            <button type="button" onClick={loadGame}>Load World</button>
            <button type="button" onClick={() => { setShowTitle(false); setModal('research') }}>Research Lab</button>
          </div>
        </section>
      )}

      {showHowTo && (
        <section className="how-to-card" aria-label="How to play">
          <header>
            <h2>What Do I Do?</h2>
            <button type="button" onClick={() => setShowHowTo(false)} aria-label="Close how to play">×</button>
          </header>
          <ol>
            <li>Look at your patient queue.</li>
            <li>Select a patient.</li>
            <li>Complete their next task.</li>
            <li>Watch for clinic problems.</li>
            <li>Keep the workflow moving.</li>
          </ol>
          <button type="button" onClick={() => setShowHowTo(false)}>Got It</button>
        </section>
      )}

      {showDisruption && (
        <section className="disruption-card" aria-label="Connectivity failure">
          <h2>⚠ Connectivity Failure</h2>
          <p>Your clinic has lost reliable internet connectivity.</p>
          <h3>Why It Matters</h3>
          <p>External referrals and result transmission may be delayed. Local clinic work can continue.</p>
          <div className="button-row">
            <button type="button" onClick={() => { setShowDisruption(false); addFeedback('Continuing locally. Prioritize provider and lab work.') }}>Continue Locally</button>
            <button type="button" onClick={() => addFeedback('Waiting increases delays. Local work is still available.', 'warn')}>Wait For Connection</button>
            <button type="button" onClick={() => { setShowDisruption(false); setModal('computer') }}>View Affected Patients</button>
          </div>
        </section>
      )}

      {daySummary && (
        <Modal title="Day Complete" onClose={() => setDaySummary(null)}>
          <DaySummaryPanel
            summary={daySummary}
            onNextDay={() => {
              setDaySummary(null)
              if (pendingConnectivityScenario) startConnectivityScenario()
            }}
            onBottlenecks={() => {
              setDaySummary(null)
              setModal('bottlenecks')
            }}
          />
        </Modal>
      )}

      {modal && (
        <Modal title={modalTitle(modal)} onClose={() => setModal(null)}>
          {modal === 'computer' && (
            <ComputerPanel
              state={state}
              selectedPatient={selectedPatient}
              onSelect={setSelectedPatientId}
              onOpenPatient={selectPatientForWork}
              workflowProgress={workflowProgress}
              onPrimaryAction={completeNextAction}
              onResolve={(gapId) => {
                setState((current) => resolveCareGap(current, gapId))
                addFeedback('✓ Care gap resolved after evidence review.')
              }}
              query={query}
              setQuery={setQuery}
              answer={answer}
              handleQuery={handleQuery}
            />
          )}
          {modal === 'patient' && selectedPatient && (
            <PatientPanel
              patient={selectedPatient}
              state={state}
              workflowStep={workflowProgress[selectedPatient.id] ?? 2}
              onPrimaryAction={() => completeNextAction(selectedPatient.id)}
              onResolve={(gapId) => {
                setState((current) => resolveCareGap(current, gapId))
                addFeedback('✓ Care gap resolved after evidence review.')
              }}
            />
          )}
          {modal === 'server' && <ServerPanel state={state} selectedPatient={selectedPatient} />}
          {modal === 'generator' && <PowerPanel state={state} setState={setState} />}
          {modal === 'cabinet' && <SupplyPanel state={state} />}
          {modal === 'research' && (
            <ResearchPanel
              state={state}
              experiment={experiment}
              onRun={runDefaultResearch}
              onExport={exportLatestExperiment}
              onExportValidation={exportLatestValidation}
              onExportEvidenceGraph={exportLatestEvidenceGraph}
              exportName={exportName}
              exportText={exportText}
              downloadUrl={downloadUrl}
            />
          )}
          {modal === 'network' && <NetworkPanel state={state} />}
          {modal === 'vehicle' && <VehiclePanel state={state} />}
          {modal === 'bottlenecks' && <BottleneckPanel bottlenecks={bottlenecks} />}
        </Modal>
      )}

      <aside className="safety-note">
        Remote Clinic uses synthetic data. Not intended for clinical decision-making.
      </aside>
    </main>
  )
}

function StatusItem({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'bad'
}) {
  return (
    <div className={`status-item ${tone ?? ''}`}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  )
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close panel">×</button>
        </header>
        {children}
      </section>
    </div>
  )
}

function ComputerPanel({
  state,
  selectedPatient,
  onSelect,
  onOpenPatient,
  workflowProgress,
  onPrimaryAction,
  onResolve,
  query,
  setQuery,
  answer,
  handleQuery,
}: {
  state: GameState
  selectedPatient?: Patient
  onSelect: (id: string) => void
  onOpenPatient: (id: string) => void
  workflowProgress: Record<string, WorkflowStep>
  onPrimaryAction: (id: string) => void
  onResolve: (id: string) => void
  query: string
  setQuery: (value: string) => void
  answer: ResearchAnswer | null
  handleQuery: () => void
}) {
  const gaps = state.careGaps.filter((gap) => gap.patientId === selectedPatient?.id)
  return (
    <div className="modal-grid two-columns">
      <aside className="record-list">
        {state.patients.map((patient) => {
          const step = workflowProgress[patient.id] ?? 2
          return (
          <button key={patient.id} type="button" className={patient.id === selectedPatient?.id ? 'active patient-card-button' : 'patient-card-button'} onClick={() => onSelect(patient.id)}>
            <strong>{patient.id}</strong>
            <span>{patient.name}, {patient.age}</span>
            <em>{stepActionText[step].button}</em>
          </button>
          )
        })}
      </aside>
      <section className="record-detail">
        {selectedPatient && (
          <>
            <PatientSummary
              patient={selectedPatient}
              workflowStep={workflowProgress[selectedPatient.id] ?? 2}
              onPrimaryAction={() => onPrimaryAction(selectedPatient.id)}
              onOpenPatient={() => onOpenPatient(selectedPatient.id)}
            />
            <PatientFlow currentStep={workflowProgress[selectedPatient.id] ?? 2} />
            <h3>Care Gaps</h3>
            <div className="care-gap-list">
              {gaps.map((gap) => (
                <article key={gap.id} className={gap.status === 'resolved' ? 'resolved' : ''}>
                  <div>
                    <strong>{gap.type}</strong>
                    <span>{gap.severity} · {gap.status}</span>
                  </div>
                  <p>{gap.evidence[0]}</p>
                  {gap.status === 'open' && <button type="button" onClick={() => onResolve(gap.id)}>Resolve After Review</button>}
                </article>
              ))}
            </div>
            <h3>Biomedical Informatics Query</h3>
            <div className="query-row">
              <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Research query" />
              <button type="button" onClick={handleQuery}>Ask</button>
            </div>
            {answer && <EvidencePanel answer={answer} />}
          </>
        )}
      </section>
    </div>
  )
}

function PatientPanel({
  patient,
  state,
  workflowStep,
  onPrimaryAction,
  onResolve,
}: {
  patient: Patient
  state: GameState
  workflowStep: WorkflowStep
  onPrimaryAction: () => void
  onResolve: (id: string) => void
}) {
  const gaps = state.careGaps.filter((gap) => gap.patientId === patient.id)
  return (
    <div className="stack-panel">
      <PatientSummary patient={patient} workflowStep={workflowStep} onPrimaryAction={onPrimaryAction} />
      <PatientFlow currentStep={workflowStep} />
      <Timeline events={patient.timeline} />
      <div className="care-gap-list">
        {gaps.map((gap) => (
          <article key={gap.id} className={gap.status === 'resolved' ? 'resolved' : ''}>
            <div>
              <strong>{gap.type}</strong>
              <span>{gap.severity} · {gap.status}</span>
            </div>
            {gap.evidence.map((item) => <p key={item}>{item}</p>)}
            {gap.status === 'open' && <button type="button" onClick={() => onResolve(gap.id)}>Resolve After Review</button>}
          </article>
        ))}
      </div>
    </div>
  )
}

function ServerPanel({ state, selectedPatient }: { state: GameState; selectedPatient?: Patient }) {
  const summary = selectedPatient ? summarizePatientWithEvidence(selectedPatient, state.careGaps) : null
  const [assistantAnswer, setAssistantAnswer] = useState('Select a suggested question to get short workflow help.')
  const quickAnswers = {
    waiting: `Most waiting work is tied to ${state.careGaps.filter((gap) => gap.status === 'open').length} unfinished simulated tasks.`,
    bottleneck: getBottlenecks(state, {}).at(0)?.label ?? 'Provider workflow is the current bottleneck.',
    prioritize: selectedPatient
      ? `${selectedPatient.id} is selected. Complete: ${stepActionText[2].button}.`
      : 'Prioritize the highest-priority patient in the work queue.',
    connectivity:
      state.connectivity === 'OFFLINE'
        ? 'Local clinic work can continue, but external referrals and sync are delayed.'
        : 'Connectivity is available, so referrals and result transmission can move normally.',
  }
  return (
    <div className="stack-panel">
      <section className="assistant-box">
        <h3>Clinic Assistant</h3>
        <p>{assistantAnswer}</p>
        <div className="button-row">
          <button type="button" onClick={() => setAssistantAnswer(quickAnswers.waiting)}>Why are patients waiting?</button>
          <button type="button" onClick={() => setAssistantAnswer(`Biggest bottleneck: ${quickAnswers.bottleneck}.`)}>Biggest bottleneck?</button>
          <button type="button" onClick={() => setAssistantAnswer(quickAnswers.prioritize)}>What should I prioritize?</button>
          <button type="button" onClick={() => setAssistantAnswer(quickAnswers.connectivity)}>If connectivity fails?</button>
        </div>
      </section>
      <div className="metric-grid">
        <Metric icon={<BrainCircuit size={18} />} label="AI queries" value={state.ai.metrics.queries} />
        <Metric icon={<ShieldAlert size={18} />} label="Unsupported" value={state.ai.metrics.unsupportedStatements} />
        <Metric icon={<BatteryCharging size={18} />} label="Power cost" value={`${state.ai.powerCost}%`} />
        <Metric icon={<Server size={18} />} label="Compute" value={`${state.ai.metrics.cpuPercent}%`} />
      </div>
      {summary && <EvidencePanel answer={summary} />}
      <h3>Failure Explorer</h3>
      <div className="failure-list">
        {state.ai.failures.map((failure) => (
          <article key={failure.id}>
            <strong>{failure.id}: {failure.type}</strong>
            <p>{failure.output}</p>
            <span>{failure.verification} · {failure.detected ? 'detected' : 'missed'} · source {failure.sourceEventId}</span>
          </article>
        ))}
      </div>
    </div>
  )
}

function PowerPanel({ state, setState }: { state: GameState; setState: React.Dispatch<React.SetStateAction<GameState>> }) {
  return (
    <div className="stack-panel">
      <div className="metric-grid">
        <Metric icon={<BatteryCharging size={18} />} label="Battery" value={`${state.resources.powerPercent}%`} />
        <Metric icon={<Server size={18} />} label="Compute load" value={`${state.resources.computingLoad}%`} />
        <Metric icon={<RadioTower size={18} />} label="Connectivity" value={state.connectivity} />
        <Metric icon={<FlaskConical size={18} />} label="Lab capacity" value={state.resources.facility.labCapacity} />
      </div>
      <div className="button-row">
        <button type="button" onClick={() => setState((current) => ({ ...current, ai: { ...current.ai, enabled: !current.ai.enabled } }))}>
          Toggle Local AI
        </button>
        <button type="button" onClick={() => setState((current) => ({ ...current, resources: { ...current.resources, powerPercent: Math.min(100, current.resources.powerPercent + 18), budget: Math.max(0, current.resources.budget - 900) } }))}>
          Run Generator
        </button>
      </div>
      <p className="disclaimer">SIMULATION RESULT. Power tradeoffs model workflow constraints, not real facility engineering.</p>
    </div>
  )
}

function SupplyPanel({ state }: { state: GameState }) {
  return (
    <div className="stack-panel">
      <div className="metric-grid">
        <Metric icon={<Stethoscope size={18} />} label="Medications" value={state.resources.supplies.medications} />
        <Metric icon={<FlaskConical size={18} />} label="Test kits" value={state.resources.supplies.testKits} />
        <Metric icon={<Boxes size={18} />} label="PPE" value={state.resources.supplies.ppe} />
        <Metric icon={<Archive size={18} />} label="Lab reagents" value={state.resources.supplies.labReagents} />
      </div>
      <Timeline events={state.events.slice(-6)} />
    </div>
  )
}

function ResearchPanel({
  state,
  experiment,
  onRun,
  onExport,
  onExportValidation,
  onExportEvidenceGraph,
  exportName,
  exportText,
  downloadUrl,
}: {
  state: GameState
  experiment?: ExperimentResult
  onRun: () => void
  onExport: (format: 'json' | 'csv' | 'jsonl' | 'markdown') => void
  onExportValidation: () => void
  onExportEvidenceGraph: () => void
  exportName: string
  exportText: string
  downloadUrl: string
}) {
  const previous = state.experiments.at(-2)
  const validation = state.experiments.length >= 2 ? runValidationSuite(state.experiments.slice(-2), `${state.worldSeed}-VALIDATION`) : null
  return (
    <div className="stack-panel">
      <div className="button-row">
        <button type="button" onClick={onRun}>Run A/B Experiment</button>
        <button type="button" onClick={() => onExport('json')}>JSON</button>
        <button type="button" onClick={() => onExport('csv')}>CSV</button>
        <button type="button" onClick={() => onExport('jsonl')}>JSONL</button>
        <button type="button" onClick={() => onExport('markdown')}>Report</button>
        <button type="button" onClick={onExportValidation}>Validation</button>
        <button type="button" onClick={onExportEvidenceGraph}>Graph</button>
      </div>
      {experiment ? (
        <>
          <ComparisonTable left={previous} right={experiment} />
          {validation && <ValidationPanel report={validation} />}
          <h3>Event Replay</h3>
          <Timeline events={experiment.events.slice(-8)} />
        </>
      ) : (
        <p className="disclaimer">No experiment has been run in this save. Research results are NOT YET MEASURED.</p>
      )}
      {exportText && (
        <div className="export-box">
          <a href={downloadUrl} download={exportName}>Download {exportName}</a>
          <textarea readOnly value={exportText} aria-label="Export preview" />
        </div>
      )}
    </div>
  )
}

function ValidationPanel({ report }: { report: ReturnType<typeof runValidationSuite> }) {
  return (
    <section className="validation-panel">
      <h3>Validation Gates</h3>
      <p>{report.passed ? 'PASS' : 'FAIL'} · {report.gates.filter((gate) => gate.passed).length}/{report.gates.length} gates passing</p>
      <div className="validation-list">
        {report.gates.map((gate) => (
          <span key={gate.name} className={gate.passed ? 'pass' : 'fail'}>
            {gate.name}
          </span>
        ))}
      </div>
    </section>
  )
}

function NetworkPanel({ state }: { state: GameState }) {
  return (
    <div className="stack-panel">
      <div className="metric-grid">
        <Metric icon={<Wifi size={18} />} label="State" value={state.connectivity} />
        <Metric icon={<RadioTower size={18} />} label="Tower" value={state.resources.technology.networkTower ? 'Active' : 'Down'} />
        <Metric icon={<Server size={18} />} label="Offline cache" value={state.resources.technology.offlineCache ? 'Ready' : 'Missing'} />
        <Metric icon={<BrainCircuit size={18} />} label="Local services" value={state.ai.enabled ? 'Available' : 'Limited'} />
      </div>
      <p className="disclaimer">Local structured tools continue offline. Telehealth and external synchronization degrade with connectivity.</p>
    </div>
  )
}

function VehiclePanel({ state }: { state: GameState }) {
  return (
    <div className="stack-panel">
      <div className="metric-grid">
        <Metric icon={<Map size={18} />} label="Vehicles" value={state.resources.transport.vehicles} />
        <Metric icon={<Activity size={18} />} label="Road" value={state.resources.transport.roadOpen ? 'Open' : 'Closed'} />
        <Metric icon={<CalendarClock size={18} />} label="Travel" value={`${state.resources.transport.averageTravelMinutes}m`} />
        <Metric icon={<Users size={18} />} label="Delayed" value={state.resources.transport.delayedPatients} />
      </div>
      <p className="disclaimer">Transportation modifies access, missed visits, supply delivery, and referral completion in the simulation.</p>
    </div>
  )
}

function PatientSummary({
  patient,
  workflowStep,
  onPrimaryAction,
  onOpenPatient,
}: {
  patient: Patient
  workflowStep: WorkflowStep
  onPrimaryAction: () => void
  onOpenPatient?: () => void
}) {
  const action = stepActionText[workflowStep]
  return (
    <section className="patient-summary">
      <div className="patient-card-header">
        <div>
          <p className="patient-id">Patient {patient.id}</p>
          <h3>{patient.name}</h3>
          <p>Age {patient.age} · {patient.community}</p>
        </div>
        <button type="button" onClick={onOpenPatient ?? onPrimaryAction}>
          {onOpenPatient ? 'View Patient' : 'Keep Working'}
        </button>
      </div>
      <dl>
        <div><dt>Priority</dt><dd>{patient.priority}</dd></div>
        <div><dt>Current location</dt><dd>{currentLocationForStep(workflowStep)}</dd></div>
        <div><dt>Reason for visit</dt><dd>{reasonForVisit(patient)}</dd></div>
      </dl>
      <div className="next-action-box">
        <span>Next Action</span>
        <strong>{action.need}</strong>
        <button type="button" disabled={workflowStep === 6} onClick={onPrimaryAction}>{action.button}</button>
      </div>
      <p><strong>Why it matters:</strong> {whyActionMatters(workflowStep)}</p>
    </section>
  )
}

function PatientFlow({ currentStep }: { currentStep: WorkflowStep }) {
  return (
    <ol className="patient-flow" aria-label="Patient workflow">
      {workflowSteps.map((step, index) => (
        <li key={step} className={index < currentStep ? 'done' : index === currentStep ? 'current' : ''}>
          <span>{index < currentStep ? '✓' : index === currentStep ? '●' : '○'}</span>
          <strong>{step}</strong>
        </li>
      ))}
    </ol>
  )
}

function Timeline({ events }: { events: Array<{ id: string; day: number; minute: number; label: string; actor: string }> }) {
  return (
    <ol className="timeline">
      {events.map((event) => (
        <li key={event.id}>
          <time>Day {event.day} · {formatTime(event.minute)}</time>
          <strong>{event.actor}</strong>
          <span>{event.label}</span>
        </li>
      ))}
    </ol>
  )
}

function EvidencePanel({ answer }: { answer: ResearchAnswer }) {
  return (
    <section className="evidence-panel">
      <h3>Answer</h3>
      <p>{answer.answer}</p>
      <h3>Evidence</h3>
      <ul>
        {answer.evidence.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <h3>Source Events</h3>
      <p>{answer.sourceEvents.length > 0 ? answer.sourceEvents.join(', ') : 'No source events returned.'}</p>
      <h3>Confidence / Limitations</h3>
      <p>{answer.confidence}. {answer.limitations}</p>
    </section>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ComparisonTable({ left, right }: { left?: ExperimentResult; right: ExperimentResult }) {
  const metrics = Object.keys(right.metrics) as Array<keyof ExperimentResult['metrics']>
  return (
    <table className="comparison-table">
      <thead>
        <tr>
          <th>Metric</th>
          <th>{left?.config.label ?? 'Baseline'}</th>
          <th>{right.config.label}</th>
        </tr>
      </thead>
      <tbody>
        {metrics.map((metric) => (
          <tr key={metric}>
            <td>{metric}</td>
            <td>{left ? left.metrics[metric] : 'NOT YET MEASURED'}</td>
            <td>{right.metrics[metric]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DaySummaryPanel({
  summary,
  onNextDay,
  onBottlenecks,
}: {
  summary: ReturnType<typeof makeDaySummary>
  onNextDay: () => void
  onBottlenecks: () => void
}) {
  return (
    <div className="stack-panel">
      <div className="metric-grid">
        <Metric icon={<Users size={18} />} label="Patients served" value={summary.patientsServed} />
        <Metric icon={<CalendarClock size={18} />} label="Average wait" value={`${summary.averageWait} min`} />
        <Metric icon={<CheckCircle2 size={18} />} label="Tasks completed" value={summary.tasksCompleted} />
        <Metric icon={<AlertTriangle size={18} />} label="Tasks delayed" value={summary.tasksDelayed} />
        <Metric icon={<RadioTower size={18} />} label="Referrals ready" value={summary.referralsCompleted} />
        <Metric icon={<Wifi size={18} />} label="Connectivity" value={`${summary.connectivity}%`} />
      </div>
      <section className="day-explain">
        <h3>What Happened?</h3>
        <p>{summary.explanation}</p>
      </section>
      <div className="button-row">
        <button type="button" onClick={onNextDay}>Next Day</button>
        <button type="button" onClick={onBottlenecks}>View Bottlenecks</button>
      </div>
    </div>
  )
}

function BottleneckPanel({ bottlenecks }: { bottlenecks: ReturnType<typeof getBottlenecks> }) {
  return (
    <div className="stack-panel">
      <div className="bottleneck-list">
        {bottlenecks.map((item, index) => (
          <article key={item.label}>
            <span>{index === 0 ? "Today's Biggest Bottleneck" : index === 1 ? 'Second' : 'Third'}</span>
            <strong>{item.label}</strong>
            <p>{item.percent}% of delays · {item.reason}</p>
          </article>
        ))}
      </div>
      <div className="bottleneck-flow">
        <span>Patient</span>
        <span>Provider</span>
        <span className={bottlenecks[0]?.label === 'Laboratory' ? 'hot' : ''}>Lab</span>
        <span className={bottlenecks[0]?.label === 'Connectivity' ? 'hot' : ''}>Result</span>
        <span>Follow-up</span>
      </div>
      <p className="disclaimer">This view connects simulation metrics to workflow delays. It is not a clinical performance claim.</p>
    </div>
  )
}

function modalTitle(modal: ModalKind) {
  switch (modal) {
    case 'computer':
      return 'Health Information System'
    case 'patient':
      return 'Patient Timeline'
    case 'server':
      return 'Clinic AI'
    case 'generator':
      return 'Power Management'
    case 'cabinet':
      return 'Supplies'
    case 'research':
      return 'Research Lab'
    case 'network':
      return 'Connectivity'
    case 'vehicle':
      return 'Transportation'
    case 'bottlenecks':
      return 'Bottlenecks'
    default:
      return 'Remote Clinic'
  }
}

function getClinicStatus(state: GameState, workflowProgress: Record<string, WorkflowStep>) {
  const unfinished = state.patients.filter((patient) => (workflowProgress[patient.id] ?? 2) < 6).length
  const labQueue = state.patients.filter((patient) => {
    const step = workflowProgress[patient.id] ?? 2
    return step === 3 || step === 4
  }).length
  const staffTotal = state.resources.staff.clinicians + state.resources.staff.nurses + state.resources.staff.technicians
  const staffAvailable = Math.max(0, staffTotal - Math.floor(state.resources.staff.workload / 34))
  const connectivityPercent =
    state.connectivity === 'ONLINE' ? 92 : state.connectivity === 'LIMITED' ? 58 : state.connectivity === 'UNSTABLE' ? 31 : 18
  const hasProblem = unfinished > 2 || labQueue > 2 || connectivityPercent < 40 || staffAvailable < 2
  const whyCare =
    connectivityPercent < 40
      ? 'Referral processing is slowing down.'
      : labQueue > 2
        ? 'Patients are waiting for results.'
        : staffAvailable < 2
          ? 'Provider wait times are increasing.'
          : 'Workflow is stable. Keep moving patients.'
  return {
    waiting: unfinished,
    labQueue,
    staffAvailable,
    staffTotal,
    connectivityPercent,
    unfinished,
    hasProblem,
    whyCare,
  }
}

function makeWorkQueue(state: GameState, workflowProgress: Record<string, WorkflowStep>) {
  return state.patients
    .map((patient) => {
      const step = workflowProgress[patient.id] ?? 2
      const isHigh = patient.priority === 'High' || patient.priority === 'Urgent'
      return {
        patient,
        step,
        nextAction: step === 6 ? 'Completed' : stepActionText[step].button,
        badge: step === 6 ? '🟢' : isHigh ? '🔴' : step >= 5 ? '🟡' : '🟠',
        tone: step === 6 ? 'complete' : isHigh ? 'high' : 'waiting',
      }
    })
    .sort((left, right) => {
      if (left.step === 6 && right.step !== 6) return 1
      if (right.step === 6 && left.step !== 6) return -1
      const priorityRank = (patient: Patient) => (patient.priority === 'Urgent' ? 0 : patient.priority === 'High' ? 1 : 2)
      return priorityRank(left.patient) - priorityRank(right.patient) || left.step - right.step
    })
}

function getCurrentObjective(state: GameState, workflowProgress: Record<string, WorkflowStep>) {
  if (state.connectivity === 'OFFLINE') return 'Resolve the connectivity problem or continue locally.'
  const nextPatient = makeWorkQueue(state, workflowProgress).find((item) => item.step < 6)
  if (!nextPatient) return 'End the day and review results.'
  const waitingCount = state.patients.filter((patient) => (workflowProgress[patient.id] ?? 2) < 3).length
  if (waitingCount > 0) return `${waitingCount} patients are waiting for a provider.`
  return `${nextPatient.patient.id}: ${stepActionText[nextPatient.step].button}.`
}

function getBottlenecks(state: GameState, workflowProgress: Record<string, WorkflowStep>) {
  const labQueue = state.patients.filter((patient) => {
    const step = workflowProgress[patient.id] ?? 2
    return step === 3 || step === 4
  }).length
  const connectivityScore = state.connectivity === 'OFFLINE' ? 5 : state.connectivity === 'UNSTABLE' ? 3 : state.connectivity === 'LIMITED' ? 2 : 0
  const providerScore = Math.ceil(state.resources.staff.workload / 25)
  const transportScore = state.resources.transport.roadOpen ? state.resources.transport.delayedPatients : state.resources.transport.delayedPatients + 4
  const total = Math.max(1, labQueue + connectivityScore + providerScore + transportScore)
  return [
    {
      label: 'Laboratory',
      percent: Math.round((labQueue / total) * 100),
      reason: labQueue > 0 ? 'patients are waiting for test orders or results' : 'lab is currently clear',
    },
    {
      label: 'Connectivity',
      percent: Math.round((connectivityScore / total) * 100),
      reason: connectivityScore > 0 ? 'external communication may be delayed' : 'network is stable',
    },
    {
      label: 'Provider availability',
      percent: Math.round((providerScore / total) * 100),
      reason: 'staff workload affects provider wait times',
    },
  ].sort((left, right) => right.percent - left.percent)
}

function makeDaySummary(state: GameState, workflowProgress: Record<string, WorkflowStep>) {
  const patientsServed = state.patients.filter((patient) => (workflowProgress[patient.id] ?? 2) >= 6).length
  const tasksCompleted = Object.values(workflowProgress).reduce<number>((sum, step) => sum + Math.max(0, step - 2), 0)
  const unfinished = state.patients.length - patientsServed
  const connectivityPercent =
    state.connectivity === 'ONLINE' ? 92 : state.connectivity === 'LIMITED' ? 58 : state.connectivity === 'UNSTABLE' ? 31 : 18
  const labQueue = state.patients.filter((patient) => {
    const step = workflowProgress[patient.id] ?? 2
    return step === 3 || step === 4
  }).length
  const explanation =
    connectivityPercent < 40
      ? 'Connectivity interruptions caused most referral and result delays.'
      : labQueue > 0
        ? 'Laboratory workflow created the main delays today.'
        : unfinished > 0
          ? 'Some patients still need follow-up actions tomorrow.'
          : 'All patients completed the normal workflow.'
  return {
    patientsServed,
    averageWait: Math.max(12, 18 + unfinished * 9 + labQueue * 6),
    tasksCompleted,
    tasksDelayed: unfinished + labQueue,
    referralsCompleted: state.patients.filter((patient) => (workflowProgress[patient.id] ?? 2) >= 5).length,
    connectivity: connectivityPercent,
    explanation,
  }
}

function reasonForVisit(patient: Patient) {
  if (patient.symptoms.includes('screening reminder')) return 'Abnormal screening result'
  if (patient.symptoms.includes('glucose concern')) return 'Glucose follow-up'
  if (patient.symptoms.includes('cough')) return 'Respiratory symptoms'
  if (patient.symptoms.includes('elevated blood pressure')) return 'Blood pressure follow-up'
  return patient.symptoms[0] ?? 'Clinic visit'
}

function currentLocationForStep(step: WorkflowStep) {
  if (step <= 2) return 'Waiting Room'
  if (step === 3) return 'Exam Room'
  if (step === 4) return 'Lab'
  if (step === 5) return 'EHR / Records'
  return 'Completed'
}

function whyActionMatters(step: WorkflowStep) {
  if (step === 2) return 'Provider evaluation is the gate before tests, referrals, and follow-up can move.'
  if (step === 3) return 'Lab orders create the results needed for the next workflow step.'
  if (step === 4) return 'Reviewing results prevents abnormal findings from becoming unresolved care gaps.'
  if (step === 5) return 'Follow-up closes the loop so patients do not disappear from the system.'
  if (step === 6) return 'This patient is no longer blocking today’s queue.'
  return 'This step moves the patient into the clinic workflow.'
}

const areaLabels: Array<{
  label: string
  left: string
  top: string
  what: string
  happening: string
  action: string
  modal: Exclude<ModalKind, null>
}> = [
  {
    label: '🏥 Waiting Room',
    left: '24%',
    top: '39%',
    what: 'Patient queue and arrivals.',
    happening: 'Patients are waiting for provider work.',
    action: 'Open records to select a patient.',
    modal: 'computer',
  },
  {
    label: '🩺 Exam Room',
    left: '42%',
    top: '47%',
    what: 'Provider workflow.',
    happening: 'Patient visits move through here.',
    action: 'View the selected patient.',
    modal: 'patient',
  },
  {
    label: '🧪 Lab',
    left: '56%',
    top: '57%',
    what: 'Testing workflow.',
    happening: 'Lab queue affects result delays.',
    action: 'Inspect supplies and lab status.',
    modal: 'cabinet',
  },
  {
    label: '📡 Communications',
    left: '66%',
    top: '32%',
    what: 'Network tower and telehealth.',
    happening: 'Connectivity controls referrals and sync.',
    action: 'Inspect connectivity.',
    modal: 'network',
  },
]

function formatTime(minute: number) {
  const hour = Math.floor(minute / 60)
  const minutes = minute % 60
  return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export default App
