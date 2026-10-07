# Game Design

Remote Clinic is a voxel biomedical informatics simulation. The player is a clinic operations coordinator, not an omniscient doctor.

## Core Loop

1. Explore the clinic and community.
2. Inspect patients, records, infrastructure, and resources.
3. Resolve simulated care gaps by reviewing evidence.
4. Respond to weather, power, network, supply, and transportation disruptions.
5. Use local AI summaries, then verify the source events.
6. End the day and review outcomes.
7. Enter the Research Lab to run reproducible experiments.

## Current Playable Slice

- First-person voxel world with terrain, roads, clinic, homes, transport hub, network tower, generator, solar array, battery bank, and Research Lab console.
- Buildable blocks for clinic expansion and infrastructure.
- Synthetic patients with timelines and incomplete records.
- Care-gap resolution.
- Local structured AI summaries and failure explorer.
- Research A/B experiment and exports.

## Design Constraint

The game intentionally keeps patient and AI mechanics synthetic. It does not model diagnosis or treatment.
