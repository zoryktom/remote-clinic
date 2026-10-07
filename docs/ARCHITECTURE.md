# Architecture

Remote Clinic is a static browser app built with Vite, React, TypeScript, and Three.js.

## Layers

## Game

`src/game` owns the Three.js scene, voxel blocks, world objects, first-person movement, interaction raycasting, NPC patient avatars, and block placement/removal.

## Simulation

`src/sim` owns deterministic patient generation, resources, power, connectivity, weather, transportation, care gaps, scoring, AI evidence, AI failures, experiments, and exports.

## Interface

`src/App.tsx` renders the HUD and in-world modal systems. These panels are opened by interacting with objects in the 3D world.

## Deployment

The app is static and deploys to GitHub Pages. No backend, cloud database, telemetry, or external AI API is required.
