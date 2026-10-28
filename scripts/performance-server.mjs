import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

// All records, secrets and delivery interception belong to this temporary server.
export async function performanceServer({ build = false, port = 3108, dist = '.next-e2e-perf' } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'newton-performance-'));
  const secret = randomBytes(32).toString('hex');
  const origin = `http://127.0.0.1:${port}`;
  const database = path.join(directory, 'fixture.db');
  const outbox = path.join(directory, 'outbox.jsonl');
  const env = { ...process.env, NODE_ENV: 'production', NEXT_DIST_DIR: dist,
    DATABASE_URL: database, OWNER_EMAIL: 'perf-empty@example.com',
    INVITED_EMAILS: 'perf-populated@example.com,perf-login@example.com',
    BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin,
    AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'local-test-only',
    MAILTRAP_API_KEY: 'local-test-only', FROM_EMAIL: 'tutor@example.com',
    PERFORMANCE_TEST_OUTBOX: outbox,
    NODE_OPTIONS: `--import=${path.resolve('test/performance-transport.mjs')}` };
  const db = new Database(database);
  migrate(drizzle(db), { migrationsFolder: 'drizzle' });
  const now = Date.now();
  const cookies = {};
  for (const fixture of ['empty', 'populated']) {
    const id = `perf-${fixture}`;
    db.prepare('INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id, 'Performance fixture', `${id}@example.com`, 1, now, now);
    const token = randomBytes(24).toString('hex');
    db.prepare('INSERT INTO session (id,token,user_id,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id, token, id, now + 86400000, now, now);
    cookies[fixture] = { name: 'better-auth.session_token', url: origin,
      value: encodeURIComponent(`${token}.${createHmac('sha256', secret).update(token).digest('base64')}`) };
  }
  for (let i = 0; i < 6; i++) {
    db.prepare('INSERT INTO courses (id,user_id,topic,created_at,started_at) VALUES (?,?,?,?,?)').run(`perf-course-${i}`, 'perf-populated', ['Operating Systems', 'Distributed Systems', 'Calculus', 'Linear Algebra', 'Computer Networks', 'Databases'][i], now - i * 1000, now - i * 1000);
    db.prepare('INSERT INTO chapters (id,course_id,idx,title,objectives,prerequisites,content,status,content_generation_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(`perf-chapter-${i}`, `perf-course-${i}`, 0, 'A measured lesson', '[]', '[]', '# A measured lesson\n\nCafé, Ελληνικά, Русский.\n\nInline math $x^2$ and a display:\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n\n```mermaid\ngraph LR\n A[Read] --> B[Practice]\n```\n', 'open', 'ready', now);
  }
  let server;
  async function close() {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise(resolve => server.once('exit', resolve));
    }
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
  try {
    if (build) {
      const originals = await Promise.all(['tsconfig.json', 'next-env.d.ts'].map(file => readFile(file, 'utf8')));
      try {
        const child = spawn('npm', ['run', 'build'], { env, stdio: 'inherit' });
        const code = await new Promise(resolve => child.once('exit', resolve));
        if (code !== 0) throw new Error(`Production build failed (${code})`);
      } finally {
        // Remove only Next's generated dist-directory substitutions; preserve other edits.
        const files = ['tsconfig.json', 'next-env.d.ts'];
        for (const [i, file] of files.entries()) {
          let current = await readFile(file, 'utf8');
          if (file === 'tsconfig.json') {
            const config = JSON.parse(current);
            const original = JSON.parse(originals[i]);
            config.include = config.include.filter(entry => !entry.startsWith(`${dist}/`) || original.include.includes(entry));
            current = JSON.stringify(config, null, 2) + '\n';
          } else {
            const routes = originals[i].match(/^import .*$/gm) ?? [];
            current = current.replace(/^import .*routes\.d\.ts.*$/m, routes.find(line => line.includes('routes.d.ts')) ?? '')
              .replace(/^import .*root-params\.d\.ts.*$/m, routes.find(line => line.includes('root-params.d.ts')) ?? '');
          }
          await writeFile(file, current);
        }
      }
    }
    let log = '';
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', chunk => { log = (log + chunk).slice(-12000); });
    server.stderr.on('data', chunk => { log = (log + chunk).slice(-12000); });
    const deadline = Date.now() + 30000;
    while (true) {
      if (server.exitCode !== null) throw new Error(`Production server exited: ${log}`);
      if (log.includes('Ready in')) {
        try { const response = await fetch(`${origin}/login`); if (response.ok) break; log += `\nHealth ${response.status}: ${(await response.text()).slice(0, 300)}`; } catch (error) { log = (log + `\n${error.message}`).slice(-12000); }
      }
      if (Date.now() > deadline) throw new Error(`Production server did not become ready: ${log}`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return { origin, db, cookies, outbox, close };
  } catch (error) { await close(); throw error; }
}
