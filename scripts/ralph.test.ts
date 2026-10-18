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
  const phase = /PHASE: (\\w+)/.exec(input)[1];
  const output = args[args.indexOf('--output-last-message') + 1];
  fs.appendFileSync(path.join(root, 'bin/phases'), phase + '\\n');
  if (mode === 'auth') { console.error('Authentication required'); process.exit(1); }
  if (mode === 'malformed') { fs.writeFileSync(output, '{bad'); return; }
  if (phase === 'discover') {
    const names = mode === 'duplicate' ? ['same','same','c','d','e'] : ['a','b','c','d','e'];
    const candidates = names.map((title,i) => ({title,category:'reliability',rationale:'Useful',evidence:['fixture.txt'],acceptanceCriteria:['Fixture improves'],impact:5-i,confidence:4,effort:1,risk:1}));
    if (mode === 'four') candidates.pop();
    fs.writeFileSync(output, JSON.stringify({ candidates }));
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
if (mode === 'checks-fail' && fs.readFileSync('fixture.txt','utf8').startsWith('improved')) process.exit(1);
if (mode === 'baseline-fail') process.exit(1);
`);
  await chmod(path.join(root, "bin", "codex"), 0o755);
  await chmod(path.join(root, "bin", "npm"), 0o755);
  vi.stubEnv("PATH", `${path.join(root, "bin")}:${process.env.PATH}`);
  git("init", "-q"); git("config", "user.email", "ralph@example.test"); git("config", "user.name", "Ralph Test");
  git("add", "."); git("commit", "-qm", "initial");
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

describe("options and ranking", () => {
  it("requires one goal, validates limits, and isolates resume", () => {
    expect(() => parseOptions([])).toThrow("exactly one");
    expect(() => parseOptions(["--goal", "a", "--goal-file", "b"])).toThrow("exactly one");
    expect(() => parseOptions(["--goal", "a", "--iterations", "-1"])).toThrow("nonnegative");
    expect(() => parseOptions(["--resume", "../bad"])).toThrow("alone");
    expect(() => parseOptions(["--resume", "abc", "--model", "m"])).toThrow("alone");
    expect(options().maxFixAttempts).toBe(3);
    expect(parseOptions(["--goal", "a"]).iterations).toBe(10);
  });
  it("ranks by score, then impact, effort, and original order", () => {
    expect(rankCandidates([candidate("low", 2), candidate("winner", 5)])[0].title).toBe("winner");
    expect(rankCandidates([candidate("first"), candidate("second")])[0].title).toBe("first");
    expect(rankCandidates([candidate("small", 2, 1), candidate("large", 4, 2)])[0].title).toBe("large");
    expect(rankCandidates([candidate("expensive", 4, 2), { ...candidate("cheap", 4, 1), risk: 2 }])[0].title).toBe("cheap");
  });
});

it("runs real subprocesses, commits a verified iteration, and resumes a finished run", async () => {
  await runRalph(options(), root);
  const saved = await state();
  expect(saved.data.phase).toBe("done");
  expect(saved.data.completed).toBe(1);
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
  expect(git("branch", "--show-current")).toMatch(/^ralph\//);
  expect(git("status", "--porcelain")).toBe("");
  const progress = await readFile(path.join(root, "progress.txt"), "utf8");
  expect(progress).toMatch(/^Earlier decisions/);
  for (const event of ["Run started", "Phase started", "Five candidates generated and ranked", "Candidate selected", "Implementation completed", "Check passed", "Verification decision", "Independent review decision", "Verified iteration approved for commit"]) expect(progress).toContain(event);
  expect(progress).toContain("Highest score among candidates");
  expect(progress).toContain("Satisfies the selected acceptance criterion");
  expect(progress).toContain("iteration limit reached");
  expect(git("show", "HEAD:progress.txt")).toBe(progress.trim());
  expect(await readFile(path.join(root, "bin", "phases"), "utf8")).toBe("discover\nimplement\nreview\n");
  const calls = await readFile(path.join(root, "bin", "calls"), "utf8");
  expect(calls).toContain("workspace-write");
  expect(calls).toContain("read-only");
  expect(calls).toContain("never");
  expect(await readFile(path.join(root, "bin", "checks"), "utf8")).toBe("run lint\nrun typecheck\nrun test\nrun build\n".repeat(2));
  await runRalph(parseOptions(["--resume", saved.id]), root);
  expect(git("rev-list", "--count", "HEAD")).toBe("2");
});

it("remembers completed features across multiple iterations", async () => {
  await runRalph({ ...options(), iterations: 2 }, root);
  expect((await state()).data.history).toHaveLength(2);
  expect(git("rev-list", "--count", "HEAD")).toBe("3");
});

it.each(["four", "duplicate", "malformed", "auth"])("rejects %s output without committing", async value => {
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
