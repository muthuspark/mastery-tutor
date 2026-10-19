import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseOptions, rankCandidates, runRalph } from "./ralph";

const candidate = (title: string, impact = 4, effort = 2) => ({
  title, category: "reliability", rationale: "Improves the goal", evidence: ["fixture.txt needs improvement"],
  acceptanceCriteria: ["Fixture improves"], impact, confidence: 4, effort, risk: 1,
});
const mustDo = (productManager: number, subjectMatterExpert: number) => ({
  productManager: { score: productManager, rationale: "Core learner need" },
  subjectMatterExpert: { score: subjectMatterExpert, rationale: "Required for mastery", domain: "Learning science" },
});
let root: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const options = () => parseOptions(["--goal", "Improve fixture", "--iterations", "1"]);
async function runs() { return (await readdir(path.join(root, ".ralph"))).filter(name => name !== "lock.json"); }
async function state() {
  const id = (await runs())[0];
  return { id, data: JSON.parse(await readFile(path.join(root, ".ralph", id, "state.json"), "utf8")) };
}
async function mode(value: string) { await writeFile(path.join(root, "bin", "mode"), value); }

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => new Response("app", { status: 200 })));
  root = await mkdtemp(path.join(tmpdir(), "ralph-test-"));
  await mkdir(path.join(root, "bin"));
  await writeFile(path.join(root, ".gitignore"), ".ralph/\nbin/\n");
  await writeFile(path.join(root, "fixture.txt"), "before\n");
  await writeFile(path.join(root, "progress.txt"), "Earlier decisions\n");
  await writeFile(path.join(root, "bin", "mode"), "success");
  const fake = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const root = process.cwd();
const mode = fs.readFileSync(path.join(root, 'bin/mode'), 'utf8');
if (args.includes('--version')) { console.log('fake codex'); process.exit(0); }
fs.appendFileSync(path.join(root, 'bin/calls'), JSON.stringify(args) + '\\n');
let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  const phase = /PHASE: ([\\w-]+)/.exec(input)[1];
  const output = args[args.indexOf('--output-last-message') + 1];
  fs.appendFileSync(path.join(root, 'bin/phases'), phase + '\\n');
  if (mode === 'auth') { console.error('Authentication required'); process.exit(1); }
  if (mode === 'malformed') { fs.writeFileSync(output, '{bad'); return; }
  if (phase === 'discover') {
    const names = mode === 'duplicate' ? ['same','same','c','d','e'] : ['a','b','c','d','e'];
    const candidates = names.map((title,i) => ({title,category:'reliability',rationale:'Useful',evidence:['fixture.txt'],acceptanceCriteria:['Fixture improves'],impact:5-i,confidence:4,effort:1,risk:1}));
    candidates.forEach((c,i) => c.mustDo = {productManager:{score:i===1?5:3,rationale:'Core learner need'},subjectMatterExpert:{score:i===1?5:3,rationale:'Required for mastery',domain:'Learning science'}});
    if (mode === 'missing-role') delete candidates[0].mustDo.subjectMatterExpert;
    if (mode === 'invalid-score') candidates[0].mustDo.productManager.score = 6;
    if (mode === 'four') candidates.pop();
    fs.writeFileSync(output, JSON.stringify({ candidates }));
  } else if (phase === 'browser-prepare') {
    const task = JSON.parse(input.split('TASK DATA (JSON):')[1].split('\\n\\n')[0]);
    fs.mkdirSync(path.dirname(path.join(root, task.browserSpec)), {recursive:true});
    fs.writeFileSync(path.join(root, task.browserSpec), '// Generated feature test\\n');
    fs.writeFileSync(output, JSON.stringify({summary:'Prepared browser test',decisions:[{decision:'Assert feature outcomes',reason:'Host supplies actual browser evidence'}]}));
  } else if (phase === 'implement' || phase === 'repair') {
    if (mode !== 'no-op') fs.writeFileSync(path.join(root, 'fixture.txt'), 'improved by ' + phase + ' ' + fs.readFileSync(path.join(root, 'bin/phases'), 'utf8').length + '\\n');
    if (mode === 'timeout' || mode === 'interrupt') { setInterval(() => {}, 1000); return; }
    fs.writeFileSync(output, JSON.stringify({summary:'Changed fixture.txt',decisions:[{decision:'Improve the fixture',reason:'Satisfies the selected acceptance criterion'}]}));
  } else {
    fs.writeFileSync(output, JSON.stringify({summary:'Reviewed',acceptancePassed:true,acceptanceEvidence:['Fixture improved'],userFacing:mode === 'browser-missing',browserEvidence:[],findings:mode === 'review-fail' ? ['Concrete defect'] : []}));
  }
});
`;
  await writeFile(path.join(root, "bin", "codex"), fake);
  await writeFile(path.join(root, "bin", "npm"), `#!/usr/bin/env node
const fs = require('node:fs');
const mode = fs.readFileSync('bin/mode','utf8');
fs.appendFileSync('bin/checks', process.argv.slice(2).join(' ')+'\\n');
if (process.argv[3] === 'test:e2e:ralph') {
  fs.appendFileSync('bin/browser-urls', process.env.RALPH_BASE_URL+'\\n');
  if (mode === 'browser-no-report') process.exit(0);
  const blocked = mode === 'browser-blocked', failed = mode === 'browser-fail', empty = mode === 'browser-empty';
  const report = {stats:{expected:blocked||failed||empty?0:1,unexpected:blocked||failed?1:0,flaky:0,skipped:0},errors:[],suites:blocked||failed?[{error:{message:blocked?"browserType.launch: Executable doesn't exist":"Expected quiz results to be visible"}}]:[]};
  fs.writeFileSync(require('node:path').join(process.env.RALPH_BROWSER_OUTPUT,'results.json'),JSON.stringify(report));
  process.exit(blocked||failed?1:0);
}
if (mode === 'checks-fail' && fs.readFileSync('fixture.txt','utf8').startsWith('improved')) process.exit(1);
if (mode === 'baseline-fail') process.exit(1);
`);
  await chmod(path.join(root, "bin", "codex"), 0o755);
  await chmod(path.join(root, "bin", "npm"), 0o755);
  vi.stubEnv("PATH", `${path.join(root, "bin")}:${process.env.PATH}`);
  git("init", "-q"); git("config", "user.email", "ralph@example.test"); git("config", "user.name", "Ralph Test");
  git("add", "."); git("commit", "-qm", "initial");
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(root, { recursive: true, force: true }); });

describe("options and ranking", () => {
  it("requires one goal, validates limits, and isolates resume", () => {
    expect(() => parseOptions([])).toThrow("exactly one");
    expect(() => parseOptions(["--goal", "a", "--goal-file", "b"])).toThrow("exactly one");
    expect(() => parseOptions(["--goal", "a", "--iterations", "-1"])).toThrow("nonnegative");
    expect(() => parseOptions(["--resume", "../bad"])).toThrow("alone");
    expect(() => parseOptions(["--resume", "abc", "--model", "m"])).toThrow("alone");
    expect(() => parseOptions(["--goal", "a", "--retry-verification"])).toThrow("requires --resume");
    expect(() => parseOptions(["--goal", "a", "--base-url", "file:///tmp/app"])).toThrow("HTTP(S)");
    expect(parseOptions(["--resume", "abc", "--retry-verification"]).retryVerification).toBe(true);
    expect(options().maxFixAttempts).toBe(3);
    expect(parseOptions(["--goal", "a"]).iterations).toBe(10);
  });
  it("ranks by score, then impact, effort, and original order", () => {
    expect(rankCandidates([candidate("low", 2), candidate("winner", 5)])[0].title).toBe("winner");
    expect(rankCandidates([candidate("first"), candidate("second")])[0].title).toBe("first");
    expect(rankCandidates([candidate("small", 2, 1), candidate("large", 4, 2)])[0].title).toBe("large");
    expect(rankCandidates([candidate("expensive", 4, 2), { ...candidate("cheap", 4, 1), risk: 2 }])[0].title).toBe("cheap");
  });
  it("prioritizes combined must-do scores over implementation value/cost", () => {
    const ranked = rankCandidates([
      { ...candidate("easy", 5, 1), mustDo: mustDo(3, 3) },
      { ...candidate("essential", 2, 5), mustDo: mustDo(5, 5) },
      { ...candidate("PM favorite", 5, 1), mustDo: mustDo(5, 2) },
    ]);
    expect(ranked.map(item => item.title)).toEqual(["essential", "PM favorite", "easy"]);
    expect(ranked[0].mustDoScore).toBe(10);
    expect(rankCandidates([
      { ...candidate("costly", 4, 5), mustDo: mustDo(5, 3) },
      { ...candidate("efficient", 4, 1), mustDo: mustDo(4, 4) },
    ])[0].title).toBe("efficient");
  });
});

it("runs real subprocesses, commits a verified iteration, and resumes a finished run", async () => {
  await runRalph(options(), root);
  const saved = await state();
  expect(saved.data.phase).toBe("done");
  expect(saved.data.completed).toBe(1);
  expect(saved.data.history[0].title).toBe("b");
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
  expect(git("branch", "--show-current")).toMatch(/^ralph\//);
  expect(git("status", "--porcelain")).toBe("");
  const progress = await readFile(path.join(root, "progress.txt"), "utf8");
  expect(progress).toMatch(/^Earlier decisions/);
  for (const event of ["Run started", "Phase started", "Five candidates generated and ranked", "Candidate selected", "Implementation completed", "Check passed", "Verification decision", "Independent review decision", "Verified iteration approved for commit"]) expect(progress).toContain(event);
  expect(progress).toContain("Highest score among candidates");
  expect(progress).toContain("Satisfies the selected acceptance criterion");
  expect(progress).toContain("iteration limit reached");
  expect(progress).toContain('"mustDoScore": 10');
  const files = await readdir(path.join(root, ".ralph", saved.id));
  const rankingFile = files.find(file => file.endsWith("ranking.json"))!;
  const ranking = JSON.parse(await readFile(path.join(root, ".ralph", saved.id, rankingFile), "utf8"));
  expect(ranking.ranked).toHaveLength(5);
  expect(ranking.selected).toBe("b");
  const implementationPrompt = files.find(file => file.includes("-implement-") && file.endsWith("prompt.txt"))!;
  const prompt = await readFile(path.join(root, ".ralph", saved.id, implementationPrompt), "utf8");
  expect(prompt).toContain('"candidate":{"title":"b"');
  expect(prompt).toContain('"subjectMatterExpert":{"score":5');
  expect(git("show", "HEAD:progress.txt")).toBe(progress.trim());
  expect(await readFile(path.join(root, "bin", "phases"), "utf8")).toBe("discover\nimplement\nbrowser-prepare\nreview\n");
  const calls = await readFile(path.join(root, "bin", "calls"), "utf8");
  expect(calls).toContain("workspace-write");
  expect(calls).toContain("read-only");
  expect(calls).toContain("never");
  expect(await readFile(path.join(root, "bin", "checks"), "utf8")).toBe("run lint\nrun typecheck\nrun test\nrun build\n".repeat(2) + `run lint\nrun typecheck\nrun test:e2e:ralph -- e2e/ralph/${saved.id}/iteration-1.spec.ts\n`);
  await runRalph(parseOptions(["--resume", saved.id]), root);
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});

it("remembers completed features across multiple iterations", async () => {
  await runRalph({ ...options(), iterations: 2 }, root);
  expect((await state()).data.history).toHaveLength(2);
  expect(git("rev-list", "--count", "HEAD")).toBe("3");
});

it.each(["four", "duplicate", "malformed", "auth", "missing-role", "invalid-score"])("rejects %s output without committing", async value => {
  await mode(value);
  await expect(runRalph(options(), root)).rejects.toThrow();
  expect((await state()).data.phase).toBe("discover");
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
});

it.each(["review-fail", "browser-missing", "checks-fail"])("bounds repairs for %s and preserves work", async value => {
  await mode(value);
  await expect(runRalph({ ...options(), maxFixAttempts: 1 }, root)).rejects.toThrow("Repair limit");
  expect((await state()).data.repairs).toBe(1);
  const progress = await readFile(path.join(root, "progress.txt"), "utf8");
  expect(progress).toContain("Repair selected");
  expect(progress).toContain("Repair completed");
  expect(progress).toContain("Run stopped; changes preserved");
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
  expect(await readFile(path.join(root, "fixture.txt"), "utf8")).toContain("repair");
});

it("stops at a failing baseline before generating ideas", async () => {
  await mode("baseline-fail");
  await expect(runRalph(options(), root)).rejects.toThrow("Baseline checks failed");
  expect((await state()).data.phase).toBe("baseline");
});

it("refuses dirty starts and changed resume state without touching edits", async () => {
  await writeFile(path.join(root, "user.txt"), "keep me");
  await expect(runRalph(options(), root)).rejects.toThrow("clean Git tree");
  expect(await runs()).toEqual([]);
  await rm(path.join(root, "user.txt"));
  await mode("malformed");
  await expect(runRalph(options(), root)).rejects.toThrow();
  const saved = await state();
  await writeFile(path.join(root, "fixture.txt"), "external edit");
  await expect(runRalph(parseOptions(["--resume", saved.id]), root)).rejects.toThrow("Repository changed");
  expect(await readFile(path.join(root, "fixture.txt"), "utf8")).toBe("external edit");
});

it("prevents overlapping runs", async () => {
  await mkdir(path.join(root, ".ralph"));
  await writeFile(path.join(root, ".ralph", "lock.json"), JSON.stringify({ pid: process.pid, host: (await import("node:os")).hostname() }));
  await expect(runRalph(options(), root)).rejects.toThrow("already running");
});

it("times out an agent and checkpoints unfinished work for repair", async () => {
  await mode("timeout");
  await expect(runRalph({ ...options(), timeoutMinutes: 0.025 }, root)).rejects.toThrow("timed out");
  const saved = await state();
  expect(saved.data.phase).toBe("repair");
  await mode("success");
  await runRalph(parseOptions(["--resume", saved.id]), root);
  expect((await state()).data.phase).toBe("done");
  expect(await readFile(path.join(root, "progress.txt"), "utf8")).toContain("Run resumed");
}, 15_000);

it("interrupts a running agent, releases the lock, and resumes", async () => {
  await mode("interrupt");
  const controller = new AbortController();
  const promise = runRalph(options(), root, controller.signal);
  const stopped = expect(promise).rejects.toThrow("Interrupted");
  await vi.waitFor(async () => expect(await readFile(path.join(root, "fixture.txt"), "utf8")).toContain("improved"), { timeout: 5000 });
  controller.abort();
  await stopped;
  const saved = await state();
  expect(saved.data.phase).toBe("repair");
  expect(await runs()).toEqual([saved.id]);
  await mode("success");
  await runRalph(parseOptions(["--resume", saved.id]), root);
  expect((await state()).data.completed).toBe(1);
}, 15_000);


it("reads a goal file, forwards the model as an argument, and never executes goal text", async () => {
  const goalFile = path.join(root, "bin", "goal.txt");
  await writeFile(goalFile, "Improve fixture; $(touch INJECTED) `touch INJECTED` ");
  await runRalph({ ...options(), goal: undefined, goalFile, model: "fixture-model" }, root);
  expect((await state()).data.goal).toContain("$(touch INJECTED)");
  const calls = await readFile(path.join(root, "bin", "calls"), "utf8");
  expect(calls).toContain('"--model","fixture-model"');
  await expect(readFile(path.join(root, "INJECTED"))).rejects.toThrow();
});

it("recovers a commit completed before its checkpoint without duplicating it", async () => {
  await runRalph(options(), root);
  const saved = await state();
  saved.data.head = git("rev-parse", "HEAD^");
  saved.data.phase = "commit";
  saved.data.candidate = candidate(saved.data.history[0].title);
  saved.data.completed = 0;
  saved.data.history = [];
  await writeFile(path.join(root, ".ralph", saved.id, "state.json"), JSON.stringify(saved.data));
  await runRalph(parseOptions(["--resume", saved.id]), root);
  expect((await state()).data.completed).toBe(1);
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});

it("rechecks after a failed commit hook and preserves the staged changes", async () => {
  const hook = path.join(root, ".git", "hooks", "pre-commit");
  await writeFile(hook, "#!/bin/sh\nexit 1\n");
  await chmod(hook, 0o755);
  await expect(runRalph(options(), root)).rejects.toThrow("commit exited");
  const saved = await state();
  expect(saved.data.phase).toBe("verify");
  await rm(hook);
  await runRalph(parseOptions(["--resume", saved.id]), root);
  expect((await state()).data.completed).toBe(1);
  expect((await readFile(path.join(root, "bin", "checks"), "utf8")).split("run build")).toHaveLength(4);
});

it("refuses resume on another branch without updating the checkpoint", async () => {
  await mode("malformed");
  await expect(runRalph(options(), root)).rejects.toThrow();
  const saved = await state();
  git("switch", "-qc", "other");
  await expect(runRalph(parseOptions(["--resume", saved.id]), root)).rejects.toThrow("Switch to");
  expect((await state()).data).toEqual(saved.data);
});


it("does not count progress logging as a feature change", async () => {
  await mode("no-op");
  await expect(runRalph(options(), root)).rejects.toThrow("No changes to commit");
  expect(git("rev-list", "--count", "HEAD")).toBe("1");
  expect(await readFile(path.join(root, "progress.txt"), "utf8")).toContain("No changes to commit");
});


it("runs browser tests on the host with the selected URL and passes artifacts to review", async () => {
  await runRalph({ ...options(), baseUrl: "http://localhost:4321" }, root);
  expect(await readFile(path.join(root, "bin", "browser-urls"), "utf8")).toBe("http://localhost:4321\n");
  const saved = await state();
  const files = await readdir(path.join(root, ".ralph", saved.id));
  const reviewPrompt = files.find(file => file.includes("-review-") && file.endsWith("prompt.txt"))!;
  const prompt = await readFile(path.join(root, ".ralph", saved.id, reviewPrompt), "utf8");
  expect(prompt).toContain('"browserResult":{"spec":');
  expect(prompt).toContain("results.json");
  expect(prompt).toContain("do not launch a server or browser here");
  expect(await readFile(path.join(root, "progress.txt"), "utf8")).toContain("Host Playwright verification");
});

it.each(["browser-blocked", "browser-empty", "browser-no-report"])("preserves browser phase and repair budget for %s", async value => {
  await mode(value);
  await expect(runRalph(options(), root)).rejects.toThrow("Browser verification blocked");
  const saved = await state();
  expect(saved.data.phase).toBe("browser-run");
  expect(saved.data.repairs).toBe(0);
  await mode("success");
  await runRalph(parseOptions(["--resume", saved.id]), root);
  expect((await state()).data.completed).toBe(1);
});

it("waits for an existing server without starting one or spending repairs", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));
  await expect(runRalph(options(), root)).rejects.toThrow("existing app");
  const saved = await state();
  expect(saved.data.phase).toBe("browser-run");
  expect(saved.data.repairs).toBe(0);
  await expect(readFile(path.join(root, "bin", "browser-urls"))).rejects.toThrow();
});

it("routes real browser assertion failures into bounded code repairs", async () => {
  await mode("browser-fail");
  await expect(runRalph({ ...options(), maxFixAttempts: 1 }, root)).rejects.toThrow("Repair limit");
  const saved = await state();
  expect(saved.data.repairs).toBe(1);
  expect(saved.data.feedback[0]).toContain("Playwright acceptance test failed");
});

it("allows explicit re-verification of changed edits and old exhausted runs without resetting repairs", async () => {
  await mode("review-fail");
  await expect(runRalph({ ...options(), maxFixAttempts: 1 }, root)).rejects.toThrow("Repair limit");
  const saved = await state();
  // A version-one checkpoint predating browser support remains readable.
  delete saved.data.baseUrl;
  delete saved.data.browserResult;
  await writeFile(path.join(root, ".ralph", saved.id, "state.json"), JSON.stringify(saved.data));
  await writeFile(path.join(root, "fixture.txt"), "manual improvement\n");
  const spec = path.join(root, "e2e", "ralph", saved.id, "iteration-1.spec.ts");
  await writeFile(spec, "// Manually corrected browser locator\n");
  await mode("success");
  await runRalph(parseOptions(["--resume", saved.id, "--retry-verification", "--base-url", "http://localhost:3000"]), root);
  expect((await state()).data.completed).toBe(1);
  expect(await readFile(spec, "utf8")).toBe("// Manually corrected browser locator\n");
  const phases = (await readFile(path.join(root, "bin", "phases"), "utf8")).trim().split("\n");
  expect(phases.filter(phase => phase === "browser-prepare")).toHaveLength(1);
  const backups = (await readdir(path.join(root, ".ralph", saved.id))).filter(file => file.startsWith("state-before-reverify-"));
  expect(backups).toHaveLength(1);
  const progress = await readFile(path.join(root, "progress.txt"), "utf8");
  expect(progress).toContain('"reverifyCurrentEdits": true');
  expect(progress).toContain('"repairs": 1');
});


it("does not allow re-verification to accept an unexpected HEAD", async () => {
  await mode("browser-blocked");
  await expect(runRalph(options(), root)).rejects.toThrow("Browser verification blocked");
  const saved = await state();
  git("add", "."); git("commit", "-qm", "external commit");
  await expect(runRalph(parseOptions(["--resume", saved.id, "--retry-verification"]), root)).rejects.toThrow("Repository changed");
  expect((await state()).data).toEqual(saved.data);
});


it("uses host execution only when explicitly selected and records the choice", async () => {
  expect(() => parseOptions(["--goal", "x", "--agent-sandbox", "automatic"])).toThrow();
  await runRalph({ ...options(), agentSandbox: "danger-full-access" }, root);
  const saved = await state();
  expect(saved.data.agentSandbox).toBe("danger-full-access");
  const calls = (await readFile(path.join(root, "bin", "calls"), "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
  expect(calls.every(args => args[args.indexOf("--sandbox") + 1] === "danger-full-access")).toBe(true);
  expect(await readFile(path.join(root, "progress.txt"), "utf8")).toContain('"agentSandbox": "danger-full-access"');
});
