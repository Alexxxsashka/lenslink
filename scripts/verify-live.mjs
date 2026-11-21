import { chromium } from "@playwright/test";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const origin = process.argv[2];
if (!origin || new URL(origin).protocol !== "https:")
  throw new Error(
    "Usage: node scripts/verify-live.mjs https://your-deployment.vercel.app",
  );
const response = await fetch(origin);
assert.equal(response.status, 200);
assert.ok((await response.text()).includes("Lenslink"));
assert.ok(
  response.headers
    .get("content-security-policy")
    ?.includes("script-src 'self'"),
);
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
try {
  const context = await browser.newContext({
    permissions: ["camera", "microphone"],
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [],
    failures = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => failures.push(r.url().replace(/#.*/, "")));
  const room = randomBytes(24).toString("hex"),
    key = randomBytes(24).toString("hex");
  const hash = `#room=${room}&key=${key}`;
  await page.goto(origin + "/" + hash);
  const phone = await context.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(origin + "/" + hash + "&mode=camera");
  await phone
    .getByRole("button", { name: "Включить камеру", exact: true })
    .click();
  await page
    .locator("#connection-status")
    .filter({ hasText: "Камера подключена" })
    .waitFor({ timeout: 45000 });
  await page.waitForFunction(
    () => document.querySelector("#stat-codec").textContent !== "—",
    {},
    { timeout: 10000 },
  );
  await page.locator("#background").selectOption("blur");
  await page
    .locator("#toast")
    .filter({ hasText: "Обработка выполняется" })
    .waitFor({ timeout: 30000 });
  await page.screenshot({
    path: "test-results/live-studio.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      origin,
      http: response.status,
      status: await page.locator("#connection-status").innerText(),
      codec: await page.locator("#stat-codec").innerText(),
      resolution: await page.locator("#stat-resolution").innerText(),
      modelLoaded: true,
      errors,
      failures,
    }),
  );
  assert.deepEqual(errors, []);
  await phone.getByRole("button", { name: "Стоп", exact: true }).click();
} finally {
  await browser.close();
}
