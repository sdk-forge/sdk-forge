# Integration Tests

Integration tests call real HTTP endpoints with a generated SDK. They are skipped by default and must be opted into explicitly.

## Why they're opt-in

The integration tests hit `petstore3.swagger.io`, a public sandbox that is not under our control. Running them on every PR would introduce flakiness from network issues or sandbox downtime that has nothing to do with our code. Unit and generator tests cover correctness; integration tests confirm the full pipeline produces a working SDK against a live API.

## Running locally

```bash
bun run test:integration
```

This is equivalent to:

```bash
RUN_INTEGRATION_TESTS=1 bun test tests/e2e/integration.test.ts
```

## What the integration test does

1. Loads `specs/petstore3-official.json` (the official Swagger Petstore v3 OpenAPI spec)
2. Runs it through the full sdk-forge pipeline: load → normalize → build IR → generate TypeScript
3. Writes the generated SDK to a temp directory
4. Dynamically imports the generated client using Bun's native TypeScript support (no compilation step needed)
5. Calls `GET /pet/{petId}` with ID `1` against `https://petstore3.swagger.io/api/v3`
6. Asserts the response contains `id: 1` and a `name` field

The test has a 20-second timeout to accommodate network latency.

## Running all tests (unit + integration)

```bash
# Unit and generator tests only (fast, no network, always run)
bun test

# Unit + integration together
RUN_INTEGRATION_TESTS=1 bun test
```

## Known limitations of the petstore sandbox

The `petstore3.swagger.io` sandbox is a shared, stateful service. Some endpoints are unreliable:

| Endpoint | Reliability | Notes |
|----------|-------------|-------|
| `GET /pet/{petId}` | ✅ Reliable | Read-only, ID 1 always exists |
| `GET /pet/findByStatus` | ⚠️ Flaky | Returns 500 intermittently |
| `POST /pet` | ⚠️ Flaky | Shared state, other users modify data |
| `GET /store/inventory` | ❌ Unreliable | Returns 500 frequently |

The integration test only uses `GET /pet/1` for this reason.

## Adding a new integration test

Integration tests live in `tests/e2e/`. To add one:

1. Create a new test file under `tests/e2e/`, e.g. `tests/e2e/my-api.test.ts`
2. Gate the test on the env var:
   ```typescript
   import { test } from 'bun:test';
   const SKIP = !process.env.RUN_INTEGRATION_TESTS;

   test.skipIf(SKIP)('my integration test', async () => {
     // ...
   }, 20_000); // always set an explicit timeout
   ```
3. Document any external dependencies or reliability caveats here

## Running in CI

Integration tests are **not** run in the standard CI workflow (`ci.yml`). To run them in CI for a specific branch or PR, trigger the job manually or add a separate workflow that is only dispatched on demand:

```yaml
# .github/workflows/integration.yml (example — not yet wired up)
on:
  workflow_dispatch:  # manual trigger only

jobs:
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.1.x"
      - run: bun install --frozen-lockfile
      - run: bun run test:integration
```
