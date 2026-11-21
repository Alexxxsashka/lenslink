import { test, expect } from "@playwright/test";
const room = "a".repeat(48),
  key = "b".repeat(48);
const hash = `#room=${room}&key=${key}&host=127.0.0.1&port=9001&path=/peerjs&secure=false`;
test("phone → studio → OBS; controls, recording, effects, privacy and stop", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/" + hash);
  await expect(
    page.getByRole("heading", { name: "Камера телефона — в студии" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Записать", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/studio-desktop.png",
    fullPage: true,
  });
  const phone = await context.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto("/" + hash + "&mode=camera");
  await phone
    .getByRole("button", { name: "Включить камеру", exact: true })
    .click();
  await expect(page.locator("#connection-status")).toHaveText(
    "Камера подключена",
    { timeout: 25000 },
  );
  await expect(page.locator("#stat-resolution")).not.toHaveText("—");
  await expect(page.locator("#stat-codec")).not.toHaveText("—");
  await page.locator("#contrast").fill("120");
  await page.locator("#contrast").dispatchEvent("input");
  await expect(page.locator("#contrast-value")).toHaveText("120%");
  await page.locator("#background").selectOption("blur");
  await expect(page.locator("#toast")).toContainText("Обработка выполняется", {
    timeout: 25000,
  });
  await page.locator("#background").selectOption("none");
  await page.locator("#tracking").check();
  await expect(page.locator("#toast")).toContainText("Обработка выполняется", {
    timeout: 20000,
  });
  await page.locator("#tracking").uncheck();
  await page.getByRole("button", { name: "Записать", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Остановить", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Выходы", exact: true }).click();
  const viewUrl = await page.locator("#obs-link").inputValue();
  expect(viewUrl).not.toContain(key);
  const view = await context.newPage();
  view.on("pageerror", (e) => errors.push(e.message));
  await view.goto(viewUrl);
  await expect(view.locator("#empty")).toBeHidden({ timeout: 20000 });
  await expect(view.locator("header")).toHaveCount(0);
  await page.getByRole("button", { name: "Студия", exact: true }).click();
  await page.getByRole("button", { name: "Остановить", exact: true }).click();
  await page.getByRole("button", { name: "Выходы", exact: true }).click();
  await expect(page.locator("#downloads a")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#downloads a").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/lenslink-.*\.(webm|mp4)/);
  await page.getByRole("button", { name: "Студия", exact: true }).click();
  await page.locator("#mic-enabled").uncheck();
  await expect(phone.locator("#mic-enabled")).not.toBeChecked();
  await phone.getByRole("button", { name: "Стоп", exact: true }).click();
  await expect(page.locator("#empty")).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
});
test("responsive layouts and corrupt links", async ({ page }) => {
  await page.goto("/" + hash);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/studio-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Руководство", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "От телефона до эфира" }),
  ).toBeVisible();
  await page.goto("/#mode=view&room=invalid");
  await expect(
    page.getByRole("heading", { name: "Не удалось открыть комнату" }),
  ).toBeVisible();
});
