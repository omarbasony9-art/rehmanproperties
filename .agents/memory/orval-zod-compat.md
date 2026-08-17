---
name: Orval zod v3 compatibility
description: Orval 8.23+ generates zod v4 API calls (zod.int, zod.email) which fail with zod v3; workaround is in the OpenAPI spec.
---

# Orval + Zod v3 Compatibility

**The rule:** When using Orval 8.23+ with zod v3 (catalog: ^3.25.76), do NOT use `type: integer` or `format: email` in the OpenAPI spec. They generate `zod.int()` and `zod.email()` which don't exist in zod v3.

**Why:** Orval 8.23 generates zod v4-style calls. The workspace catalog pins `zod: ^3.25.76` which is still v3. This causes `tsc --build` to fail with "Property 'int' does not exist on type 'typeof import(zod)'".

**How to apply:**
- Replace `type: integer` with `type: number` throughout openapi.yaml.
- Remove `format: email` from email fields (just use `type: string`).
- After making spec changes, re-run `pnpm --filter @workspace/api-spec run codegen` and verify `tsc --build` passes.
- Do NOT bump zod to v4 without checking all consumers — zod v4 has breaking API changes.
