import { mkdir, cp } from "node:fs/promises";
const target = new URL("../public/wasm/", import.meta.url);
await mkdir(target, { recursive: true });
await cp(
  new URL("../node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url),
  target,
  { recursive: true },
);
console.log("MediaPipe WASM prepared for same-origin loading.");
