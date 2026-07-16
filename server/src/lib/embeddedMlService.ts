import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

// Only used in production (see index.ts's start()), gated on EMBEDDED_ML_SERVICE — local dev
// keeps running the ML service as its own separate process (`npm run dev:ml`), unaffected.
// This file lives at server/src/lib/, which tsc preserves as server/dist/lib/ once built — so
// unlike index.ts (server/dist/index.js, two levels from the repo root), this needs three.
const ML_SERVICE_DIR = path.resolve(import.meta.dirname, "../../../ml-service");

let mlProcess: ChildProcess | null = null;
let shuttingDown = false;

function runToCompletion(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", args, { cwd: ML_SERVICE_DIR, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`python3 ${args.join(" ")} exited with code ${code}`));
    });
  });
}

export async function startEmbeddedMlService(): Promise<void> {
  // Idempotent, purely additive (CREATE TABLE IF NOT EXISTS) — safe to run on every start.
  await runToCompletion(["-m", "app.migrate"]);

  mlProcess = spawn("python3", ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], {
    cwd: ML_SERVICE_DIR,
    stdio: "inherit",
  });

  mlProcess.on("exit", (code, signal) => {
    if (shuttingDown) return;
    // The ML half died unexpectedly — exit Express too, so Render sees the whole container as
    // crashed and restarts it, rather than limping along with every /api/ml/* call failing.
    console.error(`Embedded ML service exited unexpectedly (code=${code}, signal=${signal})`);
    process.exit(1);
  });

  mlProcess.on("error", (err) => {
    console.error("Failed to start embedded ML service:", err);
    process.exit(1);
  });
}

export function stopEmbeddedMlService(): void {
  shuttingDown = true;
  mlProcess?.kill("SIGTERM");
}
