# Remote Clinic

### A healthcare simulation for exploring AI, resource constraints, and clinical workflow.

Remote Clinic is an open-source voxel simulation game in which players operate a fictional remote healthcare clinic under constraints involving staffing, connectivity, transportation, supplies, computing resources, and power.

The game is intentionally not a healthcare dashboard. The player walks through a 3D voxel community, enters the clinic, interacts with computers, patients, the local AI server, generator, network tower, supply cabinets, and the Research Lab. The simulation underneath tracks synthetic patients, longitudinal timelines, care gaps, disruptions, AI failures, research experiments, and reproducible exports.

**Tagline:** Care more patients. Make better decisions. Survive the constraints.

## Demo

The GitHub Pages build runs as a static site. After publishing, the project URL is:

https://zoryktom.github.io/remote-clinic/

## Why It Exists

Remote Clinic demonstrates the idea that healthcare AI cannot be evaluated only as an isolated model. It has to be evaluated inside the system where it operates:

- people
- workflow
- resources
- infrastructure
- connectivity
- uncertainty
- interruptions
- human oversight

The voxel game is the interface. The simulation is the research environment. The AI is an experimental component. The generated data is the evidence.

## How To Play

Start a new world and walk into the clinic. Interact with in-world objects:

- Clinic computers open patient records, timelines, care gaps, and structured informatics queries.
- Synthetic patients expose incomplete records, missed follow-ups, referral tasks, and transportation barriers.
- The local AI server shows evidence-backed summaries and deliberate AI failure modes.
- The generator, battery bank, solar array, and network tower expose infrastructure tradeoffs.
- The Research Lab runs reproducible A/B experiments and exports JSON, CSV, JSONL, and Markdown reports.

The player can also place and remove buildable voxel blocks such as walls, floors, glass, storage, solar panels, batteries, and servers. Expanding infrastructure affects the simulation through capacity and resource constraints.

## Research Mode

Research Mode supports reproducible experiment configurations:

- population size
- staff count
- connectivity state
- local AI availability
- power level
- transportation reliability
- supplies
- weather
- duration
- number of runs
- random seed

The current vertical slice includes an A/B experiment comparing offline operation with and without local AI. Results are labeled **SIMULATION RESULT** and should not be interpreted as real-world clinical evidence.

## AI System

Clinic AI is local-first and optional. The shipped version uses structured rules over simulation data and does not require a cloud API.

It can:

- summarize synthetic patient records
- identify care gaps
- answer structured research questions
- show evidence and source events
- expose deliberate AI failures

It must not:

- diagnose patients
- provide real medical advice
- invent patient events
- invent research results
- claim clinical validity

## Architecture

```text
src/game/
  Three.js voxel world, first-person movement, interaction, block placement

src/sim/
  deterministic patient generation, resources, care gaps, AI evidence,
  experiments, exports, scoring

src/App.tsx
  React in-world panels and game HUD

docs/
  simulation, AI, research, ethics, privacy, reproducibility documentation

research/
  research questions, hypotheses, methodology, protocols, results notes
```

## Reproducibility

Every generated world uses a seed. Experiment results include:

- simulation ID
- random seed
- configuration
- software version
- generated timestamp
- metrics
- events
- AI failures

Exports never include real patient data.

## Limitations

Remote Clinic uses synthetic patients and fictional clinical scenarios. It is not a medical device, diagnostic tool, clinical decision support system, staffing recommendation system, or outcome prediction model.

All clinical-looking records are generated simulation data. Any measured result is a simulation result only.

## Install

```bash
npm install
npm run dev
```

## Test

```bash
npm run test
npm run build
```

## Deploy

GitHub Pages is served from the `gh-pages` branch. A local deployment can be produced with:

```bash
npm run build
git subtree push --prefix dist origin gh-pages
```

If the branch already exists, deploy by replacing the contents of `gh-pages` with the latest `dist` build.

## License

MIT. See [LICENSE](LICENSE).
