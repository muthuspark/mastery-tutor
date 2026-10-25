import { randomUUID } from "node:crypto";
import { db } from "./db";
import { authEvents } from "./db/schema";
export function recordAuthEvent(event: "code_requested" | "provider_accepted" | "provider_failed" | "verified" | "first_course" | "first_lesson", userId?: string) {
  db.insert(authEvents).values({ id: randomUUID(), event, userId, createdAt: new Date() }).onConflictDoNothing().run();
}
