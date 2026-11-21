# Lenslink

**Turn a phone browser into a camera for your desktop and OBS.** Open source, no phone app, no account. Русский интерфейс.

**Live:** https://lenslink-lemon.vercel.app · **Source:** https://github.com/Alexxxsashka/lenslink

Lenslink captures video and microphone audio in Safari/Chrome, transmits them over encrypted WebRTC, and provides a desktop studio, a clean OBS Browser Source, browser dock controls, local effects and recording.

## Use

1. Open the deployed HTTPS site on your computer.
2. Scan the studio QR code with your phone. Open it in **Safari on iOS** or **Chrome on Android**.
3. Tap **Включить камеру** and allow camera/microphone access. Keep the phone unlocked and the tab active.
4. On the computer, adjust the camera, process the picture, or record a clip.
5. In **Выходы**, copy the clean source URL into OBS → Sources → Browser. Set source dimensions/FPS to your scene, enable **Control audio via OBS**, disable shutdown when invisible.
6. For Zoom, Discord, Telegram or another website, start **OBS Virtual Camera** and select it as the video input. OBS Virtual Camera does **not** carry microphone audio: use your computer mic or an independently configured virtual audio device.

The OBS custom browser dock URL adds camera controls inside OBS. The dock is a web integration, **not a native OBS plugin**.

## What this release does

| Capability | Implementation / limit |
| --- | --- |
| QR pairing | 192-bit room capability plus separate 192-bit controller capability, in URL fragments |
| Wi-Fi / remote video | WebRTC through PeerJS; direct where possible, your TURN for restrictive networks |
| Phone microphone | WebRTC audio, optional; no silent promise of virtual microphone support |
| Capture settings | Request 720p / 1080p / 4K and 24 / 30 / 60 FPS; actual values depend on hardware/browser |
| Remote controls | Front/back camera, capture profile, microphone, torch and zoom when the track reports support |
| Processing | Exposure, contrast, saturation, mirror, looks, person background blur/color replacement, face-centered crop |
| Custom LUT | 3D `.cube`, size 2–64, domain normalization and trilinear interpolation; local to each viewer |
| Recording | Processed canvas video + phone audio; MP4/WebM according to browser support; 30 min / 512 MiB memory cap |
| OBS output | Clean browser source with audio, and a custom browser dock; up to four receiving peers |
| AI / LUT output | Capped at 1280 pixels wide to limit CPU use; actual FPS can be lower |

### Not implemented / not guaranteed

- A Windows virtual camera driver owned by Lenslink. Use the existing OBS virtual camera.
- A compiled native OBS plugin. The included integration is Browser Source + web dock.
- Direct USB video transport. USB tethering may provide the underlying IP network; pairing still uses WebRTC.
- Forced hardware H.264/H.265 encoding. Browsers negotiate codecs and select encoder implementation. The studio displays the negotiated inbound codec; 4K/60 and HEVC are **not guaranteed**.
- Background transmission on iOS. Safari can suspend camera capture when locked or in the background.
- A hosted TURN relay, uptime guarantee, multi-camera mixing, or persistent cloud recordings.

## Develop

Node 22.12+ or 24 LTS and npm:

```sh
npm ci
npm run dev
npm run build
npm test
```

`postinstall` copies MediaPipe WASM from the pinned npm dependency into `public/wasm/` (ignored by Git). Small model files are checked into `public/models/`, so AI processing does not fetch models from a third-party CDN at runtime. See [THIRD_PARTY.md](THIRD_PARTY.md).

Use HTTPS to test on an actual phone; `http://<desktop-LAN-IP>` cannot access the camera. Localhost is a secure-context exception only on the device opening it. Deploy to Vercel for a real-phone test.

### Verification

```sh
npx playwright install msedge
npm run test:e2e
```

Tests launch a local PeerServer on port 9001 and an isolated headless Edge instance with synthetic camera/audio. They exercise two-way signaling, phone→studio video, additional clean OBS viewer, remote microphone control, AI model initialization, recording download, stop, malformed links, and layouts at 1440/768/390 px. No real camera is read by these tests. This does not certify physical iPhone, OBS CEF, or Windows virtual camera compatibility: verify those manually with your hardware.

## Deploy to Vercel

Import this GitHub repository into Vercel as a **Vite** project. Build: `npm run build`; output: `dist`. No server secrets or database are needed. The `main` branch is the production source. The application is static; Vercel does not host a WebSocket PeerServer or TURN service.

The production URL must be public for a phone or OBS without your Vercel account. Preview deployments may remain protected. See [deployment settings](https://vercel.com/docs/deployment-protection).

## Your own signaling / TURN

The default public PeerJS signaling service and public Google/Cloudflare STUN services are conveniences, not an availability guarantee. Video does not pass through the signaling service. STUN does not relay media.

For reliable connections between different networks deploy a PeerServer behind HTTPS/WSS, and a TURN server on infrastructure that supports its UDP/TCP traffic. A starter [Docker Compose file](infra/compose.yml) is included for **PeerServer only**. Configure TLS at your reverse proxy. TURN is separate infrastructure and may have bandwidth costs.

In **Соединение**, enter the PeerServer hostname, port (normally 443), and path. The phone and OBS links carry only that public signaling configuration. Enter ICE servers on **each** device separately, for example:

```json
[
  { "urls": "stun:stun.l.google.com:19302" },
  {
    "urls": ["turn:turn.example.com:3478?transport=udp", "turns:turn.example.com:5349?transport=tcp"],
    "username": "short-lived-username",
    "credential": "short-lived-password"
  }
]
```

On the phone use **Настроить сеть** below the camera, then restart the camera. With custom ICE configuration include any desired STUN entries yourself. TURN credentials are not automatically shared to OBS: open the site at the same origin in OBS's browser context, configure the connection there, and use **Запомнить настройки** if persistence is appropriate, then load the clean output. Native OBS recording/window capture of the studio is an alternative when configuring a relay in CEF is inconvenient.

By default settings live only in the current page. Opt-in persistence stores network settings, including TURN credentials, in that browser's `localStorage`. Use short-lived credentials; do not use a shared permanent TURN password in a public client. Switching signaling servers requires reopening the updated phone link and updating the OBS source.

## Security and privacy

- The room URL is a **bearer capability**: anyone holding the viewing link can receive video/audio. The QR / camera / dock links also include the controller capability. Do not post them publicly.
- Keys use `crypto.getRandomValues`, not guessable short room codes. URLs keep capabilities in fragments, with `Referrer-Policy: no-referrer`.
- Anyone knowing the room capability can impersonate a sender; this version does not authenticate identities or cryptographically verify peers. Use only trusted links and self-host signaling when needed.
- PeerJS signaling sees IP addresses, peer identifiers and negotiation metadata (including the controller capability in connection metadata); TLS protects transport to signaling. The operator is part of the trust boundary. Media uses WebRTC encryption. A configured TURN server relays encrypted packets and sees connection metadata.
- At most four receiving peers, each consumes another outgoing media stream. New sessions revoke old studio URLs by changing room/controller capabilities; stop the old camera on the phone as well.
- No analytics, sign-in, cloud storage or recording uploads. Google Fonts is an external resource. Models/WASM load from the app's origin.
- Recording stays in RAM until downloaded and is lost on refresh. Treat the download as the durable copy.
- Remote commands are allowlisted; ranges and LUT structures are validated. Viewer-only links cannot execute camera commands. A Content Security Policy limits script/model loading to the app origin.

See [SECURITY.md](SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## References

- [PeerJS documentation](https://peerjs.com/docs/)
- [MediaDevices.getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [OBS Browser Source](https://obsproject.com/kb/browser-source)
- [OBS Virtual Camera](https://obsproject.com/kb/virtual-camera-guide)
- [MediaPipe Image Segmenter](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter/web_js)

MIT for Lenslink source; third-party dependencies/models retain their own licenses.
