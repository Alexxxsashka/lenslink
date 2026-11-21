# Third-party components

Lenslink's MIT license does not replace the licenses of its dependencies or model assets.

| Component | Source | License |
| --- | --- | --- |
| PeerJS | https://github.com/peers/peerjs | MIT |
| QRCode | https://github.com/soldair/node-qrcode | MIT |
| Lucide icons | https://lucide.dev/license | ISC |
| MediaPipe Tasks Vision JS / WASM | https://github.com/google-ai-edge/mediapipe | Apache-2.0 |
| Inter (Google Fonts) | https://github.com/rsms/inter | SIL Open Font License 1.1 |

Model assets are redistributed unmodified from Google's MediaPipe model distribution, and are used according to their model documentation and upstream terms:

- `public/models/selfie_segmenter.tflite`: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite
- `public/models/blaze_face_short_range.tflite`: https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite
- [Selfie segmentation model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf)
- [BlazeFace model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Short%20Range%20Face%20Detection.pdf)
- [MediaPipe upstream Apache license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE)

Runtime WASM is copied from the pinned npm package during installation. Preserve upstream license headers in redistributed files. `package-lock.json` records exact npm dependency versions and integrity hashes.
