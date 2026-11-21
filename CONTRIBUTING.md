# Contributing

Use Node 24 LTS, `npm ci`, `npm test`, and `npm run build`. Run `npm run test:e2e` with Microsoft Edge installed when changing media/signaling behavior. Never use real camera data in automated tests.

Include reproduction steps and browser/OS versions for issues; redact all session links and network credentials. State whether a feature was tested on physical iOS Safari or Android Chrome. Keep UI claims aligned with verified browser capabilities.

Architecture:

- `src/protocol.js`: capability links, message value validation, LUT parsing/interpolation.
- `src/connection.ts`: PeerJS lifecycle, viewers, controller command authorization and reconnection.
- `src/media.ts`: canvas effects, MediaPipe processing and bounded in-memory recording.
- `src/main.ts`: studio, phone, clean viewer, OBS dock and settings.
- `src/style.css`: responsive UI.

Native OBS modules, OS virtual-camera drivers and USB transports are separate projects and should not be represented by nonfunctional UI controls. Discuss implementation and maintenance scope before adding them.
