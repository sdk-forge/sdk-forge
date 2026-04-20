# sdk-forge

Generate production-quality TypeScript SDKs from OpenAPI specs. Free and open-source alternative to Fern, Stainless, and Speakeasy.

```bash
npx sdk-forge generate --spec ./openapi.yaml --lang typescript --output ./sdk
```

## Why sdk-forge?

The good SDK generators are expensive. The free one (OpenAPI Generator) has 4,500+ open issues and produces mechanical output that developers don't want to maintain. sdk-forge aims to close that gap: a truly free, open-source tool that generates idiomatic, production-ready SDKs.

## Requirements

| Tool | Version | Notes |
|------|---------|-------|
| [Bun](https://bun.sh) | ≥ 1.1 | Required to run the generator |
| Node.js | ≥ 18 | Required only for generated **backend** SDKs (native `fetch`) |
| TypeScript | ≥ 5.4 | For generated SDKs and contributing |

> **Frontend SDKs** (generated with `--target frontend`) have no Node.js requirement — they work in any modern browser.

## Installation

```bash
# Run without installing (recommended to always get the latest)
npx sdk-forge generate --spec ./openapi.yaml --output ./sdk

# Or install globally
npm install -g sdk-forge
bun add -g sdk-forge
```

## Usage

### Generate a TypeScript SDK

```bash
sdk-forge generate \
  --spec ./openapi.yaml \
  --lang typescript \
  --output ./my-api-sdk
```

### Generate a browser-safe frontend SDK

```bash
sdk-forge generate \
  --spec ./openapi.yaml \
  --lang typescript \
  --target frontend \
  --output ./my-api-sdk-browser
```

### Validate a spec before generating

```bash
sdk-forge validate --spec ./openapi.yaml
```

### CLI reference

```
sdk-forge generate

  --spec     Path to OpenAPI 3.x spec file (YAML or JSON)  [required]
  --lang     Target language                                 [default: typescript]
  --target   SDK target: frontend or backend                 [default: backend]
  --output   Output directory                                [default: ./sdk]

sdk-forge validate

  --spec     Path to OpenAPI 3.x spec file (YAML or JSON)  [required]
```

## What gets generated

```
my-api-sdk/
├── src/
│   ├── index.ts              # Public exports
│   ├── client.ts             # Client class with one method per endpoint
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces and enums
│   └── core/
│       ├── fetcher.ts        # HTTP client (bundled, no external deps)
│       ├── auth.ts           # Auth injection (bearer, API key, basic)
│       └── errors.ts         # ApiError class
├── package.json
└── tsconfig.json
```

Generated SDKs have **zero external dependencies**. Everything needed is bundled into `src/core/`.

## Using a generated SDK

```typescript
import { PetstoreClient } from './my-api-sdk/src/index.js';

const client = new PetstoreClient({
  baseUrl: 'https://api.example.com',
  auth: { kind: 'bearer', token: process.env.API_TOKEN },
});

const pet = await client.getPet(42);
const pets = await client.listPets({ query: { status: 'available' } });
```

## Frontend vs backend target

Use `--target frontend` to generate a browser-safe SDK. The key differences:

| | `--target backend` (default) | `--target frontend` |
|---|---|---|
| Runtime | Node.js 18+ | Any modern browser |
| Auth secrets | API keys, bearer tokens | OAuth tokens, session cookies |
| Use case | Server-side API calls | Client-side API calls |

## Supported languages

| Language | Status |
|----------|--------|
| TypeScript | ✅ Available |
| Python | 🔜 Planned |

## Packages

This is a Bun monorepo. Each package is published independently to npm.

| Package | npm | Description |
|---------|-----|-------------|
| [`packages/cli`](./packages/cli) | `sdk-forge` | The `sdk-forge` CLI command |
| [`packages/core`](./packages/core) | `@sdk-forge/core` | Spec loading, normalization, and IR |
| [`packages/generator-typescript`](./packages/generator-typescript) | `@sdk-forge/generator-typescript` | TypeScript SDK generator |

## Architecture

sdk-forge uses a pipeline architecture: spec → IR → generator. The intermediate representation (IR) normalizes OpenAPI's inconsistencies so each language generator only needs to know how to express the IR, not deal with the spec directly.

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full design document including the IR specification, code generation approach, and how to add a new language generator.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) to get started.

## License

MIT
