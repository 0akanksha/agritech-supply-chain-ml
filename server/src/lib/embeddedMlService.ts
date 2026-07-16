import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

// Only used in production (see index.ts's start()), gated on EMBEDDED_ML_SERVICE — local dev
// keeps running the ML service as its own separate process (`npm run dev:ml`), unaffected.
// This file lives at server/src/lib/, which tsc preserves as server/dist/lib/ once built — so
// unlike index.ts (server/dist/index.js, two levels from the repo root), this needs three.
const ML_SERVICE_DIR = path.resolve(import.meta.dirname, "../../../ml-service");

let mlProcess: ChildProcess | null = null;
let shuttingDown = false;

const READY_URL = "http://127.0.0.1:8000/health";
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_INTERVAL_MS = 300;

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

// uvicorn has to import pandas/scikit-learn/mlflow before it's actually ready to accept
// connections — genuinely slow (several seconds) on free-tier CPU. Without this wait, Express
// would call app.listen() and pass Render's health check almost immediately, and any request
// that hits an /api/ml/* route in that window fails with "ML service is unavailable" — this
// isn't hypothetical, it happened on the very first real deploy. Since free-tier Render sleeps
// after 15 min idle and re-runs this whole startup on every wake, it would recur constantly,
// not just once, if left unfixed.
async function waitUntilReady(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(READY_URL);
      if (res.ok) return;
    } catch {
      // not accepting connections yet — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS));
  }
  throw new Error(`Embedded ML service did not become ready within ${READY_TIMEOUT_MS}ms`);
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

  await waitUntilReady();
}

export function stopEmbeddedMlService(): void {
  shuttingDown = true;
  mlProcess?.kill("SIGTERM");
}
