import {
  Activity,
  Archive,
  BatteryCharging,
  Boxes,
  BrainCircuit,
  CalendarClock,
  Download,
  FlaskConical,
  HeartPulse,
  Map,
  Pause,
  Play,
  RadioTower,
  Save,
  Server,
  Settings,
  ShieldAlert,
  Snowflake,
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
import type { ExperimentResult, GameState, Patient, ResearchAnswer } from './sim/types'

type ModalKind = 'computer' | 'patient' | 'server' | 'generator' | 'cabinet' | 'research' | 'network' | 'vehicle' | null

const saveKey = 'remote-clinic-save-v1'

function App() {
  const [state, setState] = useState<GameState>(() => createInitialGameState())
  const [showTitle, setShowTitle] = useState(true)
  const [paused, setPaused] = useState(false)
  const [target, setTarget] = useState<InteractionTarget | null>(null)
  const [modal, setModal] = useState<ModalKind>(null)
  const [selectedPatientId, setSelectedPatientId] = useState(state.selectedPatientId)
  const [query, setQuery] = useState('Which patients have unresolved referrals?')
  const [answer, setAnswer] = useState<ResearchAnswer | null>(null)
  const [blockMessage, setBlockMessage] = useState('Selected White Wall Block.')
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

  const selectedPatient = useMemo(
    () => state.patients.find((patient) => patient.id === selectedPatientId) ?? state.patients[0],
    [selectedPatientId, state.patients],
  )

  const openCareGaps = state.careGaps.filter((gap) => gap.status === 'open')
  const experiment = state.experiments.at(-1)
  const downloadUrl = useMemo(() => {
    if (!exportText) return ''
    return URL.createObjectURL(new Blob([exportText], { type: 'text/plain' }))
  }, [exportText])

  const handleQuery = () => {
    setAnswer(answerStructuredQuestion(query, state.patients, state.careGaps, state.events, state.ai.failures))
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

  return (
    <main className="app-shell">
      <div ref={containerRef} className="game-canvas" aria-label="Remote Clinic 3D world" />

      <section className="hud top-hud" aria-label="Clinic status">
        <div className="brand-chip">
          <HeartPulse size={18} />
          <span>Remote Clinic</span>
        </div>
        <StatusItem icon={<CalendarClock size={16} />} label={`Day ${state.day}`} value={formatTime(state.minute)} />
        <StatusItem icon={<Snowflake size={16} />} label="Weather" value={state.weather.replace('_', ' ')} />
        <StatusItem icon={<Wifi size={16} />} label="Internet" value={state.connectivity} tone={state.connectivity === 'OFFLINE' ? 'bad' : 'ok'} />
        <StatusItem icon={<BatteryCharging size={16} />} label="Power" value={`${state.resources.powerPercent}%`} tone={state.resources.powerPercent < 25 ? 'bad' : 'ok'} />
        <StatusItem icon={<Users size={16} />} label="Waiting" value={`${Math.min(openCareGaps.length, 12)}`} />
        <StatusItem icon={<BrainCircuit size={16} />} label="AI" value={state.ai.enabled ? 'Local' : 'Off'} tone={state.ai.enabled ? 'ok' : 'warn'} />
      </section>

      <div className="reticle" aria-hidden="true" />
      {target && (
        <button className="interaction-prompt" type="button" onClick={() => target.kind !== 'none' && setModal(target.kind)}>
          <span>E</span>
          {target.label}
        </button>
      )}

      <section className="hud left-panel" aria-label="Mission journal">
        <div className="panel-heading">
          <Map size={18} />
          <span>{state.scenario}</span>
        </div>
        <ul className="journal-list">
          <li data-done="true">Clinic computer inspected</li>
          <li data-done={openCareGaps.length < state.careGaps.length}>Resolve a care gap</li>
          <li data-done={state.experiments.length > 0}>Run first experiment</li>
        </ul>
        <div className="score-ring" style={{ '--score': `${state.score.overall}%` } as CSSProperties & Record<'--score', string>}>
          <strong>{state.score.overall}</strong>
          <span>score</span>
        </div>
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
        <IconButton label={paused ? 'Resume simulation' : 'Pause simulation'} onClick={() => setPaused((value) => !value)}>
          {paused ? <Play size={18} /> : <Pause size={18} />}
        </IconButton>
        <IconButton label="Advance day" onClick={() => !paused && setState((current) => advanceDay(current))}>
          <Activity size={18} />
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
            <span>Healthcare is a system. AI is only one part of it.</span>
          </div>
          <div className="title-actions">
            <button type="button" onClick={() => setShowTitle(false)}>New World</button>
            <button type="button" onClick={loadGame}>Load World</button>
            <button type="button" onClick={() => { setShowTitle(false); setModal('research') }}>Research Lab</button>
          </div>
        </section>
      )}

      {modal && (
        <Modal title={modalTitle(modal)} onClose={() => setModal(null)}>
          {modal === 'computer' && (
            <ComputerPanel
              state={state}
              selectedPatient={selectedPatient}
              onSelect={setSelectedPatientId}
              onResolve={(gapId) => setState((current) => resolveCareGap(current, gapId))}
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
              onResolve={(gapId) => setState((current) => resolveCareGap(current, gapId))}
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
              exportName={exportName}
              exportText={exportText}
              downloadUrl={downloadUrl}
            />
          )}
          {modal === 'network' && <NetworkPanel state={state} />}
          {modal === 'vehicle' && <VehiclePanel state={state} />}
        </Modal>
      )}
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
  onResolve,
  query,
  setQuery,
  answer,
  handleQuery,
}: {
  state: GameState
  selectedPatient?: Patient
  onSelect: (id: string) => void
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
        {state.patients.slice(0, 12).map((patient) => (
          <button key={patient.id} type="button" className={patient.id === selectedPatient?.id ? 'active' : ''} onClick={() => onSelect(patient.id)}>
            <strong>{patient.id}</strong>
            <span>{patient.name}</span>
            <em>{patient.priority}</em>
          </button>
        ))}
      </aside>
      <section className="record-detail">
        {selectedPatient && (
          <>
            <PatientSummary patient={selectedPatient} />
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
  onResolve,
}: {
  patient: Patient
  state: GameState
  onResolve: (id: string) => void
}) {
  const gaps = state.careGaps.filter((gap) => gap.patientId === patient.id)
  return (
    <div className="stack-panel">
      <PatientSummary patient={patient} />
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
  return (
    <div className="stack-panel">
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
  exportName,
  exportText,
  downloadUrl,
}: {
  state: GameState
  experiment?: ExperimentResult
  onRun: () => void
  onExport: (format: 'json' | 'csv' | 'jsonl' | 'markdown') => void
  exportName: string
  exportText: string
  downloadUrl: string
}) {
  const previous = state.experiments.at(-2)
  return (
    <div className="stack-panel">
      <div className="button-row">
        <button type="button" onClick={onRun}>Run A/B Experiment</button>
        <button type="button" onClick={() => onExport('json')}>JSON</button>
        <button type="button" onClick={() => onExport('csv')}>CSV</button>
        <button type="button" onClick={() => onExport('jsonl')}>JSONL</button>
        <button type="button" onClick={() => onExport('markdown')}>Report</button>
      </div>
      {experiment ? (
        <>
          <ComparisonTable left={previous} right={experiment} />
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

function PatientSummary({ patient }: { patient: Patient }) {
  return (
    <section className="patient-summary">
      <div>
        <h3>{patient.name}</h3>
        <p>{patient.id} · age {patient.age} · {patient.community}</p>
      </div>
      <dl>
        <div><dt>Priority</dt><dd>{patient.priority}</dd></div>
        <div><dt>Transport</dt><dd>{patient.transportation}</dd></div>
        <div><dt>Follow-up</dt><dd>{patient.followUpHistory}</dd></div>
      </dl>
      <p><strong>Symptoms:</strong> {patient.symptoms.join(', ')}</p>
      <p><strong>Incomplete information:</strong> {patient.incompleteInformation.join(', ')}</p>
    </section>
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
    default:
      return 'Remote Clinic'
  }
}

function formatTime(minute: number) {
  const hour = Math.floor(minute / 60)
  const minutes = minute % 60
  return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export default App
