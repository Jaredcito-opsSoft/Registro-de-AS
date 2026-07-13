import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

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

async function runViewportSmoke(browser, label, profile) {
  const context = await browser.newContext({
    ...profile,
    locale: "es-MX",
    colorScheme: "light",
    geolocation: { latitude: 19.4326, longitude: -99.1332 },
  });
  await context.grantPermissions(["camera", "geolocation"], { origin: new URL(baseUrl).origin });
  const page = await context.newPage();
  const prefix = label;

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await waitForAppReady(page);

    await assertVisible(page, "#login-title", `${prefix}: login title`);
    await assertVisible(page, "#guestAccessBtn", `${prefix}: guest access button`);
    await screenshot(page, `${prefix}-01-login`);

    await enterGuestMode(page);
    await assertVisible(page, ".topbar h1", `${prefix}: app header`);
    await assertVisible(page, '[data-view="home"]', `${prefix}: home view`);
    await assertVisible(page, ".home-welcome", `${prefix}: personalized welcome`);
    await assertNavActive(page, "home", `${prefix}: home nav active`);
    const permissionAlertHidden = await page.locator("#permissionOnboarding").evaluate((node) => node.classList.contains("is-hidden"));
    record(`${prefix}: permission alert clears after grant`, permissionAlertHidden);
    await screenshot(page, `${prefix}-02-home`);

    await page.locator('.nav-button[data-target="attendance"]').click();
    await page.waitForSelector('[data-view="entry"]:not(.is-hidden), [data-view="exit"]:not(.is-hidden), [data-view="attendance-complete"]:not(.is-hidden)', { timeout: 8000 });
    await assertNavActive(page, "attendance", `${prefix}: attendance nav active`);
    await assertVisible(page, ".attendance-identity-summary", `${prefix}: automatic identity summary`);
    const visibleIdentityInputs = await page.locator('#entryName:visible, #entryMatricula:visible, #exitMatricula:visible').count();
    record(`${prefix}: identity inputs hidden`, visibleIdentityInputs === 0, `${visibleIdentityInputs} visible`);
    const activateCameraButtons = await page.locator("#startEntryCamera, #startExitCamera").count();
    record(`${prefix}: no activate camera step`, activateCameraButtons === 0, `${activateCameraButtons} buttons`);
    const activeCamera = await page.waitForFunction(() => {
      const video = document.querySelector('[data-view="entry"]:not(.is-hidden) video, [data-view="exit"]:not(.is-hidden) video');
      const liveTrack = video?.srcObject?.getVideoTracks?.().some((track) => track.readyState === "live");
      return Boolean(liveTrack && video.readyState >= 2 && video.videoWidth > 0);
    }, null, { timeout: 12000 }).then(() => true).catch(() => false);
    record(`${prefix}: camera starts automatically with live video`, activeCamera);
    await screenshot(page, `${prefix}-03-attendance`);

    await page.locator('.nav-button[data-target="records"]').click();
    await page.waitForSelector('[data-view="records"]:not(.is-hidden)', { timeout: 8000 });
    await assertNavActive(page, "records", `${prefix}: records nav active`);
    const recordsContentVisible = await page.locator('#recordsMobileCards:visible, #emptyRecords:visible, .table-wrap:visible').count() > 0;
    record(`${prefix}: records content`, recordsContentVisible);
    await assertVisible(page, ".records-overview", `${prefix}: records summary`);
    await assertVisible(page, ".records-filters", `${prefix}: records filters`);
    if (profile.isMobile) {
      const statusSelect = page.locator("#filterStatus");
      const statusBox = await statusSelect.boundingBox();
      const filterBox = await page.locator(".records-filters").boundingBox();
      const statusFits = Boolean(statusBox && filterBox && statusBox.x >= filterBox.x && statusBox.x + statusBox.width <= filterBox.x + filterBox.width + 1);
      record(`${prefix}: iOS status select fits`, statusFits, statusBox ? `w=${Math.round(statusBox.width)}` : "no box");
    }
    await screenshot(page, `${prefix}-04-records`);

    if (profile.isMobile) {
      await page.evaluate(() => {
        const base = {
          id: "smoke-record",
          nombre: "Usuario operativo",
          matricula: "OPERATIVO",
          fecha: new Date().toISOString().slice(0, 10),
          sitioNombre: "Sitio principal",
          horaEntrada: "08:05 a.m.",
          validacionIdentidad: "identidad_validada",
          ubicacionEntradaValidada: true,
          evidenciaEntradaCompleta: true,
          riesgo: "normal",
        };
        window.renderMobileRecordCards([
          { ...base, id: "smoke-pending", estado: "entrada_registrada", horaSalida: "" },
          { ...base, id: "smoke-complete", estado: "asistencia_completa", horaSalida: "05:15 p.m.", ubicacionSalidaValidada: true, evidenciaSalidaCompleta: true },
        ]);
      });
      await assertVisible(page, ".mobile-record-result[data-tone='pending']", `${prefix}: pending journey guidance`);
      await assertVisible(page, ".mobile-record-result[data-tone='complete']", `${prefix}: complete journey guidance`);
      await assertVisible(page, ".mobile-record-next", `${prefix}: pending exit action`);
      const validationDetails = await page.locator(".mobile-record-details").count();
      record(`${prefix}: progressive validation details`, validationDetails === 2, `${validationDetails} details`);
      await page.locator(".mobile-record-details summary").first().click();
      await assertVisible(page, ".mobile-record-validation-grid", `${prefix}: validations expanded`);
      await screenshot(page, `${prefix}-04b-record-states`);
    }

    await page.locator("#btn-profile").click();
    await page.waitForSelector('[data-view="profile"]:not(.is-hidden)', { timeout: 8000 });
    const profileActive = await page.locator("#btn-profile").evaluate((node) => node.classList.contains("is-active"));
    record(`${prefix}: profile nav active`, profileActive);
    await assertVisible(page, "#profileForm", `${prefix}: profile content`);
    await assertVisible(page, "#profileCameraEnabled", `${prefix}: camera preference`);
    await assertVisible(page, "#profileLocationEnabled", `${prefix}: location preference`);
    if (label === "mobile-390") {
      await assertVisible(page, "#profileAvatarChangeLabel", `${prefix}: avatar picker button`);
      const avatarPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
      await page.locator("#profileAvatarInput").setInputFiles({ name: "avatar-smoke.png", mimeType: "image/png", buffer: avatarPng });
      await assertVisible(page, "#avatarCropModal:not(.is-hidden)", `${prefix}: avatar adjustment opens`);
      await assertVisible(page, "#avatarCropZoom", `${prefix}: avatar zoom control`);
      await page.locator("#avatarCropSave").click();
      await page.waitForSelector("#avatarCropModal.is-hidden", { timeout: 8000 });
      await assertVisible(page, "#profileAvatarImage", `${prefix}: avatar selected`);
      await page.evaluate(() => {
        const key = Object.keys(localStorage).find((item) => item.startsWith("asistencia_permission_preferences:"));
        if (!key) return;
        const saved = JSON.parse(localStorage.getItem(key) || "{}");
        saved.locationStatus = "denied";
        saved.locationApproved = false;
        saved.locationEnabledByUser = true;
        localStorage.setItem(key, JSON.stringify(saved));
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAppReady(page);
      await enterGuestMode(page);
      const permissionAlertStillHidden = await page.locator("#permissionOnboarding").evaluate((node) => node.classList.contains("is-hidden"));
      record(`${prefix}: enabled toggles suppress permission alert`, permissionAlertStillHidden);
      await page.locator("#btn-profile").click();
      await assertVisible(page, "#profileAvatarImage", `${prefix}: avatar persists after reload`);
    }
    await screenshot(page, `${prefix}-05-profile`);

    if (profile.isMobile) {
      const bottomNav = page.locator(".sidebar");
      const box = await bottomNav.boundingBox();
      const viewport = page.viewportSize();
      const dockedBottom = Boolean(box && viewport && box.y + box.height >= viewport.height - 4);
      record("mobile: bottom nav docked", dockedBottom, box ? `y=${Math.round(box.y)} h=${Math.round(box.height)}` : "no box");

      const activeBtn = page.locator(".nav-button.is-active, .sidebar-user-btn.is-active").first();
      const hasActive = await activeBtn.count() > 0;
      record("mobile: active nav marker css", hasActive, "is-active class on bottom nav");

      const navButtons = await page.locator(".top-nav .nav-button:not(.is-hidden)").count();
      const profileVisible = await page.locator("#btn-profile").isVisible();
      record(`${prefix}: four primary destinations`, navButtons === 3 && profileVisible, `${navButtons + Number(profileVisible)} destinations`);
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
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    record(`${prefix}: no horizontal overflow`, !horizontalOverflow);
    await screenshot(page, `${prefix}-06-home-widgets`);
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  channel: process.env.SMOKE_BROWSER_CHANNEL || undefined,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
try {
  for (const width of [320, 375, 390, 430]) {
    await runViewportSmoke(browser, `mobile-${width}`, {
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
  }
  await runViewportSmoke(browser, "tablet-768", {
    viewport: { width: 768, height: 844 },
    isMobile: false,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  await runViewportSmoke(browser, "desktop-1024", {
    viewport: { width: 1024, height: 844 },
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
