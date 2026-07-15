"""Shared-secret check between Express and this service.

This service has no user/session concept of its own — in local dev, Express (behind its own
requireAuth/requireAdmin) is the only thing that ever calls it, over localhost. On Render's
free tier there's no private networking for free services (see README's Deploying section),
so this service ends up reachable at a public URL. Requiring `X-Internal-Secret` to match
INTERNAL_ML_SECRET means a stranger who finds that URL still can't hit `/api/admin/etl/run`,
scrape `/api/predict`, etc.

Skipped entirely when INTERNAL_ML_SECRET isn't set — i.e. local dev is unaffected unless you
explicitly opt in. `/health` is always exempt: Render's own health-checker calls it directly,
with no way to attach a header.
"""

from __future__ import annotations

import os

from fastapi import Request
from fastapi.responses import JSONResponse

EXEMPT_PATHS = {"/health"}


async def require_internal_secret(request: Request, call_next):
    secret = os.environ.get("INTERNAL_ML_SECRET")
    if not secret or request.url.path in EXEMPT_PATHS:
        return await call_next(request)

    if request.headers.get("x-internal-secret") != secret:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    return await call_next(request)
