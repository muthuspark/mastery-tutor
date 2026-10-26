import "dotenv/config";
import { runMigrations } from "../lib/db";

runMigrations().then(() => console.log("Database migrations applied and relationships verified.")).catch((error) => { console.error(error.message); process.exitCode = 1; });
