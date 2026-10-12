export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startGenerationWorker } = await import("./lib/generation-worker");
  startGenerationWorker();
}
