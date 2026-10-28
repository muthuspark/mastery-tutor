import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performanceServer } from './performance-server.mjs';
import { sample, profiles } from './profile-page-load.mjs';

// Production integration checks use real local auth/data; only external delivery is intercepted.
async function main() {
  await mkdir('output/page-load-checks', { recursive: true });
  const manifest = JSON.parse(await readFile('public/fonts/optimized/manifest.json'));
  const source = 'public/fonts/optimized/' + manifest.fonts[2].subsets.find(s => s.range === 'common').file;
  const original = await readFile(source);
  const revised = execFileSync('python3', ['-c', 'from fontTools.ttLib import TTFont;from io import BytesIO;import sys;f=TTFont(sys.argv[1],recalcTimestamp=False);f["head"].fontRevision+=0.001;o=BytesIO();f.save(o);sys.stdout.buffer.write(o.getvalue())', source]);
  const versions = [original, revised].map(data => '/fonts/optimized/cache-check.' + createHash('sha256').update(data).digest('hex').slice(0, 12) + '.woff2');
  for (const [i, url] of versions.entries()) await writeFile('public' + url, [original, revised][i]);
  let server, browser;
  const results = [];
  async function check(name, fn) {
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  }
  async function withPage(fixture, fn, profile = 'desktop') {
    const context = await browser.newContext(profiles[profile]);
    try {
      if (fixture) await context.addCookies([server.cookies[fixture]]);
      await fn(await context.newPage(), context);
    } finally { await context.close(); }
  }
  try {
    server = await performanceServer({ build: process.argv.includes('--build'), port: 3118 });
    browser = await chromium.launch();
    await check('immutable font reuse and changed-version delivery', () => withPage(undefined, async page => {
      await page.goto(server.origin + '/login');
      const rows = await page.evaluate(async urls => {
        for (const url of [urls[0], urls[0], urls[1]]) { const r = await fetch(url); if (!r.ok) throw Error('Font unavailable'); await r.arrayBuffer(); }
        return performance.getEntriesByType('resource').filter(r => r.name.includes('cache-check')).map(r => ({ transfer: r.transferSize, decoded: r.decodedBodySize }));
      }, versions);
      expect(rows).toHaveLength(3);
      expect(rows[0].transfer).toBeGreaterThan(0);
      expect(rows[1].transfer).toBe(0);
      expect(rows[2].transfer).toBeGreaterThan(0);
      for (const url of versions) expect((await fetch(server.origin + url)).headers.get('cache-control')).toContain('immutable');
      for (const url of ['/login', '/', '/api/courses', '/api/auth/get-session']) expect((await fetch(server.origin + url)).headers.get('cache-control')).toContain('no-store');
      results.push({ name: 'font cache transfers', rows });
    }));
    await check('font failure preserves readable controls and keyboard logo', () => withPage(undefined, async page => {
      await page.route('**/fonts/**', r => r.abort());
      await page.goto(server.origin + '/login');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByLabel('Email address')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible();
      const logo = page.getByRole('link', { name: 'Newton', exact: true });
      await logo.focus(); await expect(logo).toBeFocused(); await logo.press('Enter');
      await expect(page).toHaveURL(server.origin + '/login');
    }));
    await check('Latin accents, combining marks, Greek and Cyrillic match original fonts', () => withPage(undefined, async page => {
      await page.goto(server.origin + '/login');
      await page.addStyleTag({ content: [
        ['EB Garamond', 'eb-garamond', '400 800'], ['Roboto Condensed', 'roboto-condensed', '100 900'],
      ].flatMap(([family, file, weight]) => ['normal', 'italic'].map(style => `@font-face{font-family:"Reference ${family}";font-style:${style};font-weight:${weight};src:url(/fonts/${file}${style === 'italic' ? '-italic' : ''}-variable.woff2)}`)).join('\n') });
      await page.evaluate(() => {
        const proof = document.createElement('div'); proof.id = 'font-proof';
        proof.style.cssText = 'width:1000px;background:white;color:black;position:fixed;top:0;left:0;z-index:1000';
        // Include decomposed accents and shared combining marks in each script.
        proof.textContent = 'Caffè e\u0301 a\u0308 ffi office. Ελληνικά α\u0301 Русский и\u0301 0123456789';
        document.body.append(proof);
      });
      for (const family of ['EB Garamond', 'Roboto Condensed']) for (const style of ['normal', 'italic']) {
        const images = [];
        for (const reference of [false, true]) {
          await page.locator('#font-proof').evaluate(async (e, { family, style, reference }) => {
            e.style.font = `${style} 400 32px/1.5 "${reference ? 'Reference ' : ''}${family}"`;
            await document.fonts.load(getComputedStyle(e).font, e.textContent); await document.fonts.ready;
          }, { family, style, reference });
          images.push(await page.locator('#font-proof').screenshot());
        }
        expect(images[0].equals(images[1]), `${family} ${style} glyph rendering`).toBe(true);
      }
    }));
    for (const profile of Object.keys(profiles)) for (const fixture of ['empty', 'populated']) await check(`delayed data/fonts CLS ${profile}/${fixture}`, async () => {
      const r = await sample(browser, { origin: server.origin, cookie: server.cookies[fixture], profile, delay: 1500, screenshot: `output/page-load-checks/${profile}-${fixture}.png` });
      expect(r.valid).toBe(true); expect(r.cls).toBeLessThanOrEqual(0.1); expect(r.overflow).toBe(false);
      results.push({ name: `CLS ${profile}/${fixture}`, cls: r.cls, shifts: r.shifts });
    });
    await check('background data error and retry preserve the creation form', () => withPage('empty', async page => {
      let failing = true;
      await page.route('**/api/courses', r => failing ? r.fulfill({ status: 503, json: { error: { message: 'Controlled outage' } } }) : r.continue());
      await page.goto(server.origin + '/');
      await expect(page.getByRole('alert').filter({ hasText: 'Could not load your studies' })).toBeVisible({ timeout: 15000 });
      await expect(page.getByLabel('What do you want to learn?')).toBeVisible();
      expect(await page.locator('.learning-workspace--empty').count()).toBe(1);
      failing = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await expect(page.getByText('Choose a topic to start your first study.', { exact: false })).toBeVisible();
    }));
    await check('authorized initial HTML, responsive layout, styles and multilingual fonts', () => withPage('populated', async (page, context) => {
      const html = await (await context.request.get(server.origin + '/')).text();
      expect(html).toContain('Operating Systems');
      expect(html).not.toContain('Loading your studies');
      expect(html).not.toContain('perf-populated@example.com');
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 }); await page.goto(server.origin + '/');
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await page.locator('h1').evaluate(e => getComputedStyle(e).fontFamily)).toContain('Roboto Condensed');
        expect(await page.locator('body').evaluate(e => getComputedStyle(e).fontFamily)).toContain('EB Garamond');
      }
      const loads = await page.evaluate(async () => {
        const text = 'Café Ελληνικά Русский →';
        const counts = [];
        for (const face of ['400 24px "EB Garamond"', 'italic 600 24px "EB Garamond"', '700 24px "Roboto Condensed"', 'italic 500 24px "Roboto Condensed"']) counts.push((await document.fonts.load(face, text)).length);
        return counts;
      });
      expect(loads.every(n => n > 0)).toBe(true);
      await page.getByRole('link', { name: 'Profile settings' }).click();
      await expect(page).toHaveURL(server.origin + '/settings');
      const logo = page.getByRole('link', { name: 'Newton', exact: true });
      await logo.focus(); await logo.press('Enter'); await expect(page).toHaveURL(server.origin + '/');
    }));
    await check('direct and linked lessons retain display math and diagrams', () => withPage('populated', async page => {
      for (const direct of [true, false]) {
        if (direct) await page.goto(server.origin + '/course/perf-course-0/ch/0');
        else {
          await page.goto(server.origin + '/');
          await page.getByRole('link', { name: /Continue studying/ }).click();
          await page.locator('a[href="/course/perf-course-0/ch/0"]').first().click();
        }
        await expect(page.locator('.katex-display')).toBeVisible();
        await expect(page.locator('.mermaid svg')).toBeVisible({ timeout: 30000 });
        expect(await page.locator('.katex').first().evaluate(e => getComputedStyle(e).fontFamily)).toContain('KaTeX');
      }
    }));
    await check('real OTP failure/success, persisted study and cross-tab sign-out', () => withPage(undefined, async (page, context) => {
      await page.goto(server.origin + '/'); await expect(page).toHaveURL(server.origin + '/login');
      expect((await context.request.get(server.origin + '/api/courses')).status()).toBe(401);
      await page.getByLabel('Email address').fill('perf-login@example.com');
      await page.getByRole('button', { name: 'Email me a code' }).click();
      await expect(page.getByLabel('Login code')).toBeVisible();
      const code = JSON.parse((await readFile(server.outbox, 'utf8')).trim().split('\n').at(-1)).code;
      const wrong = String((Number(code[0]) + 1) % 10) + code.slice(1);
      await page.getByLabel('Login code').fill(wrong); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: /code/i })).toBeVisible();
      await page.getByLabel('Login code').fill(code); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(server.origin + '/');
      await page.getByLabel('What do you want to learn?').fill('Controlled performance study');
      await page.getByRole('button', { name: 'Create study →' }).click();
      await expect(page).toHaveURL(/\/course\//);
      const row = server.db.prepare('SELECT user_id,topic FROM courses WHERE id=?').get(new URL(page.url()).pathname.split('/')[2]);
      expect(row.topic).toBe('Controlled performance study');
      const user = server.db.prepare('SELECT email FROM user WHERE id=?').get(row.user_id);
      expect(user.email).toBe('perf-login@example.com');
      const other = await context.newPage(); await other.goto(server.origin + '/');
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page).toHaveURL(server.origin + '/login'); await expect(other).toHaveURL(server.origin + '/login');
      expect((await context.request.get(server.origin + '/api/courses')).status()).toBe(401);
      await page.goBack(); await expect(page).toHaveURL(server.origin + '/login');
    }));
  } finally {
    await writeFile('output/page-load-checks/results.json', JSON.stringify(results, null, 2) + '\n');
    await browser?.close(); await server?.close();
    for (const url of versions) await rm('public' + url, { force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
