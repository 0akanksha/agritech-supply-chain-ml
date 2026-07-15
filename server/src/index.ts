import "dotenv/config";
// Patches Express's router so rejected promises in async route handlers are
// forwarded to next(err) automatically — without this, Express 4 lets an
// async handler's rejection become an unhandled rejection, which crashes
// the whole process (Node terminates on unhandled rejection by default).
import "express-async-errors";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import { attachUser } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { ensureAdminSeeded } from "./lib/ensureAdmin.js";
import { authRouter } from "./routes/auth.routes.js";
import { farmsRouter } from "./routes/farms.routes.js";
import { mlRouter } from "./routes/ml.routes.js";
import { adminRouter } from "./routes/admin.routes.js";

const app = express();
app.set("trust proxy", 1);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use(express.json());
app.use(cookieParser());
app.use(attachUser);

app.use("/api/auth", authRouter);
app.use("/api/farms", farmsRouter);
app.use("/api/ml", mlRouter);
app.use("/api/admin", adminRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4000;

async function start() {
  await ensureAdminSeeded();

  if (process.env.NODE_ENV === "production") {
    const distDir = path.resolve(import.meta.dirname, "../../dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    // configFile: false + inline plugins (mirroring vite.config.ts) avoids
    // Vite recompiling vite.config.ts into node_modules/.vite-temp on every
    // restart, which otherwise fights tsx watch's file watcher into a loop.
    const [{ createServer: createViteServer }, { default: react }, { default: tailwindcss }] = await Promise.all([
      import("vite"),
      import("@vitejs/plugin-react"),
      import("@tailwindcss/vite"),
    ]);
    const appRoot = path.resolve(import.meta.dirname, "../..");
    const vite = await createViteServer({
      configFile: false,
      root: appRoot,
      plugins: [react(), tailwindcss()],
      resolve: { alias: { "@": path.resolve(appRoot, "src") } },
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

start();
