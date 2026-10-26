import { request, type FullConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
export default async function setup(config: FullConfig) {
  const client = await request.newContext({ baseURL: config.projects[0].use.baseURL });
  const response = await client.post("/api/auth/email-otp/send-verification-otp", { data: { email: "owner@example.com", type: "sign-in" } });
  if (!response.ok()) throw new Error("Could not prepare authenticated browser tests");
  const messages = readFileSync("data/login-e2e-outbox.jsonl", "utf8").trim().split("\n").map(line => JSON.parse(line));
  const code = messages.filter(message => message.email === "owner@example.com").at(-1).code;
  if (!(await client.post("/api/auth/sign-in/email-otp", { data: { email: "owner@example.com", otp: code } })).ok()) throw new Error("Could not sign in browser fixture");
  await client.storageState({ path: "data/login-e2e-state.json" }); await client.dispose();
  const sqlite = new Database("data/login-e2e.db"); sqlite.prepare("DELETE FROM auth_limits").run(); sqlite.close();
}
