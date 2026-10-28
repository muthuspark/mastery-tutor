import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performanceServer } from './performance-server.mjs';

export const profiles = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
function category(url, type) {
  const p = new URL(url).pathname;
  if (type === 'Document') return 'document';
  if (/\.(woff2?|ttf)$/.test(p)) return 'fonts';
  if (p.endsWith('.js')) return 'scripts';
  if (p.endsWith('.css')) return 'styles';
  if (p.includes('/image') || /\.(svg|webp|png|ico)$/.test(p)) return 'images';
  return p.startsWith('/api/') ? 'api' : 'prefetch/other';
}
export async function sample(browser, { origin, cookie, profile = 'desktop', route = '/', delay = 0, failAsset = false, warm = false, screenshot }) {
  const context = await browser.newContext(profiles[profile]);
  try {
    if (cookie) await context.addCookies([cookie]);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: !warm });
    if (profile === 'mobile') {
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    if (delay) await page.route(/\/(api\/courses|fonts\/.*)$/, async r => { await new Promise(resolve => setTimeout(resolve, delay)); await r.continue(); });
    if (failAsset) await page.route('**/fonts/**', r => r.abort('failed'));
    await page.addInitScript(() => {
      window.__loadProfile = { lcp: 0, cls: 0, shifts: [] };
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.__loadProfile.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) {
        window.__loadProfile.cls += e.value;
        window.__loadProfile.shifts.push({ time: e.startTime, value: e.value, sources: e.sources.map(s => ({ tag: s.node?.tagName, class: typeof s.node?.className === 'string' ? s.node.className : '', previous: s.previousRect.toJSON(), current: s.currentRect.toJSON() })) });
      } }).observe({ type: 'layout-shift', buffered: true });
    });
    async function visit() {
      await page.goto(origin + route, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      if (route === '/') await page.getByRole('heading', { name: 'Your studies', exact: true }).waitFor();
      if (route === '/') await page.getByRole('status').filter({ hasText: 'Loading your studies' }).waitFor({ state: 'hidden', timeout: 30000 });
      await page.waitForTimeout(5000);
    }
    if (warm) { await visit(); await page.goto('about:blank'); }
    const requests = [];
    const pending = new Map();
    cdp.on('Network.requestWillBeSent', e => {
      const row = { url: e.request.url.startsWith(origin) ? e.request.url.slice(origin.length) : e.request.url, category: category(e.request.url, e.type), type: e.type, status: null, networkBytes: 0, cached: false };
      if (e.redirectResponse && pending.has(e.requestId)) { pending.get(e.requestId).status = e.redirectResponse.status; pending.get(e.requestId).redirect = true; }
      requests.push(row); pending.set(e.requestId, row);
    });
    cdp.on('Network.requestServedFromCache', e => { const row = pending.get(e.requestId); if (row) row.cached = true; });
    cdp.on('Network.responseReceived', e => { const row = pending.get(e.requestId); if (row) Object.assign(row, { status: e.response.status, cached: row.cached || e.response.fromDiskCache || e.response.fromServiceWorker, cacheControl: e.response.headers['Cache-Control'] ?? e.response.headers['cache-control'] }); });
    cdp.on('Network.loadingFinished', e => { const row = pending.get(e.requestId); if (row) { row.networkBytes = e.encodedDataLength; row.finished = true; } });
    cdp.on('Network.loadingFailed', e => { const row = pending.get(e.requestId); if (row) { row.failure = e.errorText; row.finished = true; } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await visit();
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = [nav, ...performance.getEntriesByType('resource')].map(e => ({ url: e.name.replace(location.origin, ''), transfer: e.transferSize, encoded: e.encodedBodySize, decoded: e.decodedBodySize, initiator: e.initiatorType }));
      return { resources, ...window.__loadProfile, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime, domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, path: location.pathname, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
    const totals = timing.resources.reduce((a, r) => ({ transfer: a.transfer + r.transfer, encoded: a.encoded + r.encoded, decoded: a.decoded + r.decoded }), { transfer: 0, encoded: 0, decoded: 0 });
    const groups = {};
    for (const r of timing.resources) { const key = category(origin + r.url, r === timing.resources[0] ? 'Document' : ''); const g = groups[key] ??= { count: 0, transfer: 0, decoded: 0 }; g.count++; g.transfer += r.transfer; g.decoded += r.decoded; }
    // Next can cancel an already successful speculative RSC response. Retain and
    // count it, but distinguish cancellation from failed content or missing assets.
    const cancelledPrefetches = requests.filter(r => r.category === 'prefetch/other' && r.status === 200 && r.failure === 'net::ERR_ABORTED');
    const failed = requests.filter(r => (r.failure || r.status >= 400 || !r.finished) && !cancelledPrefetches.includes(r));
    return { profile, route, warm, delay, browser: browser.version(), requests, requestCount: requests.length, timingCount: timing.resources.length, totals, groups, ...timing, errors, valid: !failed.length && !errors.length && timing.path === route, failed, cancelledPrefetches };
  } finally { await context.close(); }
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  const output = value('--output', 'output/page-load.json');
  const runs = Number(value('--runs', '3'));
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer');
  const server = await performanceServer({ build: args.includes('--build') });
  const browser = await chromium.launch();
  const report = { schema: 1, timestamp: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), worktree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }), conditions: { profiles, mobileNetwork: { latencyMs: 150, downloadBits: 1600000, uploadBits: 750000, cpuSlowdown: 4 }, window: 'load + fonts + studies settlement + 5000ms', server: 'production; warmed route/image transforms, isolated real SQLite fixtures', bytes: 'Resource Timing transferSize / encodedBodySize / decodedBodySize; CDP networkBytes reported separately', cache: 'cold contexts disable cache; repeat visits enable cache and navigate away/back' }, samples: [] };
  try {
    // Warm server and responsive image transforms without counting these visits.
    for (const profile of Object.keys(profiles)) for (const fixture of ['public', 'empty', 'populated']) await sample(browser, { origin: server.origin, route: fixture === 'public' ? '/login' : '/', cookie: server.cookies[fixture], profile });
    for (const profile of Object.keys(profiles)) for (const fixture of ['public', 'empty', 'populated']) for (let run = 1; run <= runs; run++) {
      const result = await sample(browser, { origin: server.origin, route: fixture === 'public' ? '/login' : '/', cookie: server.cookies[fixture], profile });
      report.samples.push({ fixture, run, ...result });
      console.log(`${profile}/${fixture}/${run}: ${result.requestCount} requests, ${result.totals.transfer} transferred, CLS ${result.cls.toFixed(4)}, valid=${result.valid}`);
    }
    for (const profile of Object.keys(profiles)) for (const fixture of ['public', 'empty', 'populated']) report.samples.push({ fixture, run: 1, ...await sample(browser, { origin: server.origin, route: fixture === 'public' ? '/login' : '/', cookie: server.cookies[fixture], profile, warm: true }) });
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    if (report.samples.some(r => !r.valid)) throw new Error(`Invalid samples; inspect ${output}`);
  } finally { await browser.close(); await server.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
