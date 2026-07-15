const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";

interface ProxyOptions {
  method?: "GET" | "POST";
  query?: Record<string, string>;
}

// Shared by ml.routes.ts and admin.routes.ts. FastAPI's HTTPException returns errors as
// {"detail": "..."} — this app's own error shape (see errorHandler.ts) is {"error": "..."}.
// Normalizing here means the frontend only ever has to look for one shape, regardless of
// which backend produced the error.
export async function fetchFromMlService(
  path: string,
  options: ProxyOptions = {},
): Promise<{ status: number; body: unknown }> {
  const url = new URL(path, ML_SERVICE_URL);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }

  // Matches app/internal_auth.py on the ML service: only sent (and only enforced there)
  // when INTERNAL_ML_SECRET is set — unset in local dev, set once the ML service is
  // reachable from outside this app (see README's Deploying section).
  const internalSecret = process.env.INTERNAL_ML_SECRET;
  const headers: Record<string, string> = internalSecret ? { "X-Internal-Secret": internalSecret } : {};

  let upstream: Response;
  try {
    upstream = await fetch(url, { method: options.method ?? "GET", headers });
  } catch {
    return { status: 502, body: { error: "ML service is unavailable." } };
  }

  const raw: unknown = await upstream.json().catch(() => undefined);
  const body =
    raw && typeof raw === "object" && !Array.isArray(raw) && "detail" in raw && !("error" in raw)
      ? { ...raw, error: (raw as { detail: unknown }).detail }
      : raw;

  return { status: upstream.status, body };
}
