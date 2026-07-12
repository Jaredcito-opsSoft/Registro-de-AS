import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:4173";
const outDir = join(process.cwd(), "tools", "smoke-output");
mkdirSync(outDir, { recursive: true });

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitForAppReady(page) {
  await page.waitForSelector("#login-view", { state: "visible", timeout: 15000 });
  await page.waitForTimeout(800);
}

async function enterGuestMode(page) {
  await page.click("#guestAccessBtn");
  await page.waitForSelector(".app-shell:not(.is-hidden)", { timeout: 10000 });
  await page.waitForSelector('[data-view="home"]:not(.is-hidden)', { timeout: 10000 });
  await page.waitForTimeout(600);
}

async function assertVisible(page, selector, label) {
  const el = page.locator(selector).first();
  const visible = await el.isVisible().catch(() => false);
  record(label, visible, visible ? selector : `no visible: ${selector}`);
  return visible;
}

async function assertNavActive(page, target, label) {
  const btn = page.locator(`.nav-button[data-target="${target}"]`).first();
  const active = await btn.evaluate((node) => node.classList.contains("is-active")).catch(() => false);
  record(label, active, `data-target=${target}`);
  return active;
}

async function screenshot(page, name) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function runViewportSmoke(browser, profile) {
  const context = await browser.newContext({
    ...profile,
    locale: "es-MX",
    colorScheme: "light",
  });
  const page = await context.newPage();
  const prefix = profile.isMobile ? "mobile" : "desktop";

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await waitForAppReady(page);

    await assertVisible(page, "#login-title", `${prefix}: login title`);
    await assertVisible(page, "#guestAccessBtn", `${prefix}: guest access button`);
    await screenshot(page, `${prefix}-01-login`);

    await enterGuestMode(page);
    await assertVisible(page, ".topbar h1", `${prefix}: app header`);
    await assertVisible(page, '[data-view="home"]', `${prefix}: home view`);
    await assertNavActive(page, "home", `${prefix}: home nav active`);
    await screenshot(page, `${prefix}-02-home`);

    const navTargets = [
      ["entry", "Registrar entrada"],
      ["exit", "Registrar salida"],
      ["records", "Mis registros"],
    ];

    for (const [target, heading] of navTargets) {
      await page.locator(`.nav-button[data-target="${target}"]`).first().click();
      await page.waitForSelector(`[data-view="${target}"]:not(.is-hidden)`, { timeout: 8000 });
      await page.waitForTimeout(400);
      await assertNavActive(page, target, `${prefix}: ${target} nav active`);
      const headingVisible = await page.getByRole("heading", { name: heading }).isVisible().catch(() => false);
      record(`${prefix}: ${target} heading`, headingVisible, heading);
      await screenshot(page, `${prefix}-03-${target}`);
    }

    if (profile.isMobile) {
      const bottomNav = page.locator(".sidebar");
      const box = await bottomNav.boundingBox();
      const viewport = page.viewportSize();
      const dockedBottom = Boolean(box && viewport && box.y + box.height >= viewport.height - 4);
      record("mobile: bottom nav docked", dockedBottom, box ? `y=${Math.round(box.y)} h=${Math.round(box.height)}` : "no box");

      const activeBtn = page.locator(".nav-button.is-active").first();
      const hasActive = await activeBtn.count() > 0;
      record("mobile: active nav marker css", hasActive, "is-active class on bottom nav");

      const navButtons = await page.locator(".top-nav .nav-button:not(.is-hidden)").count();
      record("mobile: visible nav buttons", navButtons >= 4, `${navButtons} buttons`);
    } else {
      const sidebar = page.locator(".sidebar");
      const box = await sidebar.boundingBox();
      const dockedLeft = Boolean(box && box.x <= 8);
      record("desktop: sidebar visible left", dockedLeft, box ? `x=${Math.round(box.x)}` : "no box");
    }

    await page.locator('.nav-button[data-target="home"]').first().click();
    await page.waitForTimeout(300);

    const timeWidget = page.locator("#clockLabel, .sys-time-chip").first();
    const streakWidget = page.locator("#homeStreakDays, .streak-widget strong").first();
    const hasTime = await timeWidget.count() > 0;
    const hasStreak = await streakWidget.count() > 0;
    record(`${prefix}: home time widget present`, hasTime);
    record(`${prefix}: home streak widget present`, hasStreak);
    await screenshot(page, `${prefix}-04-home-widgets`);
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await runViewportSmoke(browser, devices["iPhone 13"]);
  await runViewportSmoke(browser, {
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  });
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.ok);
console.log("\n--- Visual smoke summary ---");
console.log(`Checks: ${results.length}`);
console.log(`Passed: ${results.length - failed.length}`);
console.log(`Failed: ${failed.length}`);
console.log(`Screenshots: ${outDir}`);

if (failed.length) {
  console.log("\nFailures:");
  for (const item of failed) {
    console.log(`- ${item.name}: ${item.detail}`);
  }
  process.exit(1);
}
