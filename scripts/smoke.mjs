/**
 * Headless smoke test: boots the built game in Chromium, plays a few
 * seconds in the arena, and asserts the simulation actually advances.
 *
 * Usage: npm run build && npx vite preview --port 4173 &  node scripts/smoke.mjs
 * Env: BASE_URL (default http://localhost:4173), OUT_DIR for screenshots,
 *      CHROMIUM_PATH for a custom browser binary.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const OUT = process.env.OUT_DIR ?? '.';
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('console: ' + msg.text());
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/0-intro.png` });
// Skip the pixel-art intro: tap until the menu scene is live (the skip
// listener arms 600ms after a possibly slow intro boot).
for (let i = 0; i < 8; i++) {
  const onMenu = await page.evaluate(() => window.__game?.scene.isActive('menu'));
  if (onMenu) break;
  await page.mouse.click(640, 400);
  await page.waitForTimeout(900);
}
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/1-menu.png` });

// Two-step flow: tap the ARENA mode card on home, then PLAY ARENA in the
// setup view. Wide design 960x560 at 1280x800 → scale 1.2, offset (64,64):
// card center (282,240) → (402,352); PLAY (480,412) → (640,558).
await page.mouse.click(402, 352);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/1b-arena-setup.png` });
await page.mouse.click(640, 558);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/2-arena.png` });

const sample = () =>
  page.evaluate(() => {
    const arena = window.__game?.scene.getScene('arena');
    if (!arena || !arena.player) return null;
    const p = arena.player;
    return {
      x: Math.round(p.x),
      y: Math.round(p.y),
      fuel: p.fuel,
      score: p.score,
      alive: p.alive,
      trailPts: p.trail.length,
      aliveCars: arena.cars.filter((c) => c.alive).length,
      botTravel: arena.cars.filter((c) => !c.driver.isPlayer && c.alive && c.trail.length > 3).length,
    };
  });

const before = await sample();
// Drive: steer around and boost briefly.
await page.mouse.move(900, 300);
await page.waitForTimeout(2000);
await page.mouse.move(400, 600);
await page.waitForTimeout(2000);
await page.mouse.down();
await page.waitForTimeout(1500);
await page.mouse.up();
await page.waitForTimeout(1500);
const after = await sample();
await page.screenshot({ path: `${OUT}/3-driving.png` });

// --- Mobile viewport pass (touch device): narrow layouts + touch controls. ---
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
mobile.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.waitForTimeout(2500);
// Skip the intro, then land on the menu (poll — slow boot arms the skip late).
for (let i = 0; i < 8; i++) {
  const onMenu = await mobile.evaluate(() => window.__game?.scene.isActive('menu'));
  if (onMenu) break;
  await mobile.touchscreen.tap(195, 700);
  await mobile.waitForTimeout(900);
}
await mobile.waitForTimeout(600);
await mobile.screenshot({ path: `${OUT}/m1-menu.png` });
// Narrow home design 420x760 at 390x844 → scale 0.929, offset (0,69):
// ARENA card (210,232) → (195,285); setup PLAY (210,412) → (195,452).
await mobile.touchscreen.tap(195, 285);
await mobile.waitForTimeout(800);
await mobile.screenshot({ path: `${OUT}/m1b-arena-setup.png` });
await mobile.touchscreen.tap(195, 452);
await mobile.waitForTimeout(2500);
await mobile.screenshot({ path: `${OUT}/m2-arena.png` });

await browser.close();

console.log('before:', JSON.stringify(before));
console.log('after: ', JSON.stringify(after));

const failures = [];
if (errors.length) failures.push(`page errors: ${errors.slice(0, 5).join(' | ')}`);
if (!before) failures.push('arena/player never appeared — PLAY click failed?');
if (before && after) {
  // Fuel can be back at full if the player just ate orbs — a frozen sim
  // shows no fuel drain AND no score/trail growth.
  if (after.fuel >= before.fuel && after.score === before.score && after.trailPts <= before.trailPts) {
    failures.push('no fuel drain, score or trail growth — simulation frozen?');
  }
  if (after.x === before.x && after.y === before.y) failures.push('player never moved');
  if (after.aliveCars < 2) failures.push('bots missing from arena');
  if (after.botTravel === 0) failures.push('no bot has driven anywhere');
}

if (failures.length) {
  console.error('SMOKE FAIL:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('SMOKE OK');
