import test from "node:test";
import assert from "node:assert/strict";
import {
  randomToken,
  validToken,
  parseLink,
  makeLink,
  sanitizeEffects,
  parseCube,
  applyCube,
} from "../src/protocol.js";
test("capabilities are 192-bit and viewer links never leak controller key or TURN credentials", () => {
  const room = randomToken(),
    key = randomToken();
  assert.ok(validToken(room));
  assert.notEqual(room, key);
  const link = makeLink("https://example.com", "view", room, key, {
    host: "signal.example.com",
    iceServers: [{ credential: "secret" }],
  });
  assert.equal(new URL(link).search, "");
  assert.ok(!link.includes(key));
  assert.ok(!link.includes("secret"));
  assert.deepEqual(parseLink(new URL(link).hash), {
    mode: "view",
    room,
    key: null,
  });
  assert.throws(() => parseLink("#mode=camera&room=" + room));
  assert.throws(() => parseLink("#mode=view&room=123"));
});
test("remote effect values cannot escape permitted bounds", () => {
  const value = sanitizeEffects({
    brightness: 1e20,
    contrast: -5,
    saturation: NaN,
    background: "url(evil)",
    color: "red",
    tracking: "true",
    preset: "bad",
  });
  assert.equal(value.brightness, 150);
  assert.equal(value.contrast, 50);
  assert.equal(value.saturation, 100);
  assert.equal(value.background, "none");
  assert.equal(value.tracking, false);
});
test("3D cube trilinear interpolation preserves identity and alpha", () => {
  let text = "LUT_3D_SIZE 2\n";
  for (let b = 0; b < 2; b++)
    for (let g = 0; g < 2; g++)
      for (let r = 0; r < 2; r++) text += `${r} ${g} ${b}\n`;
  const lut = parseCube(text),
    pixels = new Uint8ClampedArray([12, 64, 192, 150, 255, 0, 128, 255]);
  assert.deepEqual(
    [...applyCube(pixels, lut)],
    [12, 64, 192, 150, 255, 0, 128, 255],
  );
  assert.throws(() => parseCube("LUT_3D_SIZE 65"));
  assert.throws(() => parseCube("LUT_3D_SIZE 2\n0 0 0"));
});
