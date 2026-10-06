import "dotenv/config";
import { runMigrations } from "../lib/db";

runMigrations();
console.log("Database migrations applied.");
