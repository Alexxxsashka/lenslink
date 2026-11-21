// Room and controller capabilities live in URL fragments, never query strings.
export function randomToken(bytes = 24) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export function validToken(value) {
  return typeof value === "string" && /^[a-f0-9]{48}$/.test(value);
}
export function parseLink(hash) {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const mode = p.get("mode") || "studio";
  if (!["studio", "camera", "view", "dock"].includes(mode))
    throw new Error("Неизвестный режим ссылки.");
  const room = p.get("room"),
    key = p.get("key");
  if (room !== null && !validToken(room))
    throw new Error("Повреждённая ссылка комнаты.");
  if (key !== null && !validToken(key))
    throw new Error("Повреждённый ключ управления.");
  if (mode !== "studio" && !room)
    throw new Error("В ссылке отсутствует комната. Откройте QR-код из студии.");
  if (["camera", "dock"].includes(mode) && !key)
    throw new Error("В ссылке отсутствует ключ управления.");
  return { mode, room, key };
}
export function makeLink(origin, mode, room, key, network) {
  const p = new URLSearchParams({ mode, room });
  if (key && mode !== "view") p.set("key", key);
  // Custom signaling endpoint is public configuration; TURN credentials are never shared.
  if (network?.host) {
    p.set("host", network.host);
    p.set("port", String(network.port || 443));
    p.set("path", network.path || "/peerjs");
    p.set("secure", String(network.secure !== false));
  }
  return `${origin}/#${p}`;
}
export const defaultEffects = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
  mirror: false,
  background: "none",
  color: "#292929",
  tracking: false,
  preset: "natural",
};
export function sanitizeEffects(input) {
  const out = { ...defaultEffects };
  if (!input || typeof input !== "object") return out;
  for (const [name, min, max] of [
    ["brightness", 50, 150],
    ["contrast", 50, 150],
    ["saturation", 0, 200],
    ["warmth", 0, 50],
  ]) {
    if (Number.isFinite(input[name]))
      out[name] = Math.min(max, Math.max(min, input[name]));
  }
  out.mirror = input.mirror === true;
  out.tracking = input.tracking === true;
  if (["none", "blur", "color"].includes(input.background))
    out.background = input.background;
  if (typeof input.color === "string" && /^#[a-f0-9]{6}$/i.test(input.color))
    out.color = input.color;
  if (["natural", "mono", "cinema", "warm"].includes(input.preset))
    out.preset = input.preset;
  return out;
}
export function parseCube(text) {
  let size = 0;
  let min = [0, 0, 0],
    max = [1, 1, 1];
  const rows = [];
  for (const original of text.split(/\r?\n/)) {
    const line = original.split("#")[0].trim();
    if (!line) continue;
    const p = line.split(/\s+/);
    if (p[0] === "LUT_3D_SIZE") size = Number(p[1]);
    else if (p[0] === "DOMAIN_MIN") min = p.slice(1).map(Number);
    else if (p[0] === "DOMAIN_MAX") max = p.slice(1).map(Number);
    else if (/^[+\-.\d]/.test(line)) rows.push(p.map(Number));
    else if (p[0] === "LUT_1D_SIZE")
      throw new Error("Поддерживается только 3D LUT .cube.");
  }
  if (
    !Number.isInteger(size) ||
    size < 2 ||
    size > 64 ||
    rows.length !== size ** 3 ||
    rows.some((r) => r.length !== 3 || r.some((v) => !Number.isFinite(v))) ||
    min.length !== 3 ||
    max.length !== 3 ||
    min.some(
      (v, i) => !Number.isFinite(v) || !Number.isFinite(max[i]) || max[i] <= v,
    )
  )
    throw new Error("Некорректный 3D LUT (размер 2–64).");
  return { size, min, max, data: Float32Array.from(rows.flat()) };
}
export function applyCube(pixels, lut) {
  const { size, min, max, data } = lut,
    n = size - 1;
  for (let i = 0; i < pixels.length; i += 4) {
    const xyz = [0, 1, 2].map((c) =>
      Math.max(
        0,
        Math.min(n, ((pixels[i + c] / 255 - min[c]) / (max[c] - min[c])) * n),
      ),
    );
    const lo = xyz.map(Math.floor),
      hi = lo.map((v) => Math.min(n, v + 1)),
      t = xyz.map((v, c) => v - lo[c]);
    for (let c = 0; c < 3; c++) {
      let value = 0;
      for (let z = 0; z < 2; z++)
        for (let y = 0; y < 2; y++)
          for (let x = 0; x < 2; x++) {
            const index =
              ((z ? hi[2] : lo[2]) * size * size +
                (y ? hi[1] : lo[1]) * size +
                (x ? hi[0] : lo[0])) *
                3 +
              c;
            value +=
              data[index] *
              (x ? t[0] : 1 - t[0]) *
              (y ? t[1] : 1 - t[1]) *
              (z ? t[2] : 1 - t[2]);
          }
      pixels[i + c] = Math.round(Math.max(0, Math.min(1, value)) * 255);
    }
  }
  return pixels;
}
