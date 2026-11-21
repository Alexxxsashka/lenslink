# Release verification — 2026-11-21

## Passed

- TypeScript checking and Vite production build.
- npm audit: zero reported vulnerabilities at installation.
- Three Node test cases: room/controller capability separation and validation; effect bounds; 3D LUT validation and trilinear interpolation.
- Two Playwright scenarios on isolated headless Edge with synthetic camera/audio, a local PeerServer, and no real device capture: phone→studio→clean viewer, remote mic control, AI model initialization, recording download, stop behavior, malformed links, and desktop/tablet/phone layout.
- Production-build visual inspection at 1440 / 768 / 390 px. No failures; one explained independent-column-height warning in `DESIGN.md`.
- Public production smoke test at https://lenslink-lemon.vercel.app: HTTP 200 without Vercel login; production CSP present; two peers connected through public PeerJS signaling; video received (VP8 negotiated in that run); same-origin MediaPipe background model loaded; no uncaught page errors or failed browser requests.
- Vercel Git deployment context confirms this project is linked to `Alexxxsashka/lenslink`.

The production smoke test is reproducible with:

```sh
node scripts/verify-live.mjs https://lenslink-lemon.vercel.app
```

## Not certified by these tests

Physical iPhone/Android hardware, iOS permission and background behavior, 4K/60 capture, H.265, hardware encoder use, torch/zoom on any particular phone, OBS's embedded CEF browser, OS virtual-camera integration, different-network TURN routing, and long-duration recordings. These need real-device/infrastructure testing. Native Windows drivers and a native OBS plugin are not part of this release.
