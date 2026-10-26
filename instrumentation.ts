export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { authConfig } = await import("./lib/auth-config");
  authConfig();
  const { startGenerationWorker } = await import("./lib/generation-worker");
  startGenerationWorker();
}
