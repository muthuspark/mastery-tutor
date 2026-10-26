import { mkdirSync, rmSync } from "node:fs";
mkdirSync("data", { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) rmSync(`data/login-e2e.db${suffix}`, { force: true });
rmSync("data/login-e2e-outbox.jsonl", { force: true });

rmSync("data/login-e2e-state.json", { force: true });
