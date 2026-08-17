---
name: Replit path-prefix routing
description: Replit's path-based proxy does NOT strip the artifact slug before forwarding to the service — the full path arrives at Express.
---

When an artifact has previewPath `/foreclosure-tracker`, the Replit proxy forwards
`/foreclosure-tracker/api/health` to the service as `/foreclosure-tracker/api/health`,
not as `/api/health`. Express routes registered at `/api/...` return 404.

**Why:** Replit does prefix-based routing without rewriting the path.

**How to apply:** Add a stripping middleware near the top of the Express app, before any route registration:

```typescript
app.use((req, _res, next) => {
  const prefix = "/foreclosure-tracker"; // match the artifact slug
  if (req.url.startsWith(prefix)) {
    req.url = req.url.slice(prefix.length) || "/";
  }
  next();
});
```

This is safe: direct localhost calls (e.g. curl http://localhost:PORT/api/health) keep working because the URL doesn't start with the prefix.

Apply the same pattern to any non-root artifact service that exposes an API consumed by another artifact's frontend.
