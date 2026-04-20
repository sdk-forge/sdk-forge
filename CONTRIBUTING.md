# Contributing to sdk-forge

Thanks for your interest in contributing. This document covers everything you need to get started.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| [Bun](https://bun.sh) | ≥ 1.1 | `curl -fsSL https://bun.sh/install \| bash` |
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) or via `nvm` |
| Git | any | [git-scm.com](https://git-scm.com) |

## Getting started

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/sdk-forge.git
cd sdk-forge

# 2. Install dependencies
bun install

# 3. Build all packages
bun run build     # compiles TypeScript across all packages

# 4. Verify everything works
node packages/cli/dist/index.js validate --spec specs/petstore.yaml
```

## Project structure

```
sdk-forge/
├── packages/
│   ├── cli/                         # The sdk-forge CLI
│   │   └── src/index.ts             # Commands: generate, validate
│   ├── core/                        # Shared foundation
│   │   └── src/
│   │       ├── loader/              # YAML/JSON file loading
│   │       ├── normalizer/          # $ref resolution via swagger-parser
│   │       └── ir/                  # IR types (types.ts) and builder (builder.ts)
│   └── generator-typescript/        # TypeScript SDK generator
│       └── src/
│           ├── emitters/            # ts-morph AST emitters (types, client)
│           ├── runtime-content.ts   # Bundled runtime strings (fetcher, auth, errors)
│           └── generator.ts         # Entry point: ApiSpec → GeneratedFile[]
├── specs/
│   ├── petstore.yaml               # Canonical smoke-test spec
│   └── synthetic/
│       ├── pagination.yaml         # Pagination edge cases
│       └── auth.yaml               # Auth scheme edge cases
├── docs/
│   └── ARCHITECTURE.md             # Deep-dive design document
└── KNOWN_ISSUES.md                 # Tracked bugs and limitations
```

## Development workflow

### Build

```bash
bun run build       # build all packages (uses TypeScript project references)
bun run typecheck   # type-check without emitting
bun run clean       # delete all dist/ directories
```

Packages build in dependency order automatically: `core` → `generator-typescript` → `cli`.

### Run the CLI locally

After building, run the CLI directly:

```bash
node packages/cli/dist/index.js generate \
  --spec specs/petstore.yaml \
  --lang typescript \
  --output /tmp/test-sdk

# Verify the generated SDK compiles
cd /tmp/test-sdk && bun add -d typescript && bunx tsc --noEmit
```

Or use `bun run` to skip the build step during development:

```bash
bun run packages/cli/src/index.ts validate --spec specs/petstore.yaml
```

### Making changes to the IR

The IR types live in `packages/core/src/ir/types.ts`. If you add a field to the IR:

1. Update `types.ts` with the new type
2. Update `builder.ts` to populate the new field from the spec
3. Update any generators that should use the new field
4. Update `docs/ARCHITECTURE.md` if it changes the IR specification

### Making changes to the TypeScript generator

The generator has two parts:

- **Emitters** (`packages/generator-typescript/src/emitters/`) — take a `SourceFile` (ts-morph) and write AST nodes into it. `types.emitter.ts` handles interfaces and enums; `client.emitter.ts` handles the client class.
- **Runtime content** (`packages/generator-typescript/src/runtime-content.ts`) — TypeScript source code embedded as strings. This code is written verbatim into every generated SDK's `src/core/` directory. Edit these strings to change the bundled fetcher, auth, or error handling.

After making changes, test against the petstore spec and verify the generated SDK still compiles:

```bash
bun run build
node packages/cli/dist/index.js generate --spec specs/petstore.yaml --output /tmp/test-sdk
/tmp/test-sdk/node_modules/.bin/tsc --noEmit --project /tmp/test-sdk/tsconfig.json
```

### Adding a new language generator

Each language is a separate package. To add Python (for example):

1. Create `packages/generator-python/` with `package.json`, `tsconfig.json`, and `src/`
2. Add `@sdk-forge/core` as a dependency (`workspace:*`)
3. Export a function matching this signature:
   ```typescript
   import type { ApiSpec } from '@sdk-forge/core';

   export interface GeneratedFile {
     path: string;
     content: string;
   }

   export async function generatePython(
     spec: ApiSpec,
     options: { target: 'frontend' | 'backend' }
   ): Promise<GeneratedFile[]>
   ```
4. Register the new language in `packages/cli/src/index.ts`
5. Add the package to the root `tsconfig.json` references

The IR does all the hard work. Your generator just needs to know how to express each IR construct in the target language.

## Spec files

Use the specs in `specs/` to test changes:

| Spec | Tests |
|------|-------|
| `specs/petstore.yaml` | Basic CRUD, path params, query params, enums, auth |
| `specs/synthetic/pagination.yaml` | Cursor, offset, and link-header pagination patterns |
| `specs/synthetic/auth.yaml` | Bearer, API key (header + query), and Basic auth schemes |

If you're fixing a bug or adding a feature, add or extend a synthetic spec that exercises that case.

## Submitting a pull request

1. **Open an issue first** for non-trivial changes — it's worth aligning before you invest time writing code.
2. **Branch from `main`**: `git checkout -b feat/my-feature`
3. **Keep PRs focused** — one feature or fix per PR.
4. **Test your change** against at least the petstore spec and verify the generated SDK compiles.
5. **Update `KNOWN_ISSUES.md`** if your PR resolves a tracked issue, or add a new entry if you've identified a limitation.
6. **Open the PR** against `main` with a clear description of what changed and why.

## Reporting bugs

Open a GitHub issue. Include:

- The OpenAPI spec (or a minimal reproduction) that triggers the bug
- The `sdk-forge` version (`sdk-forge --version`)
- The command you ran
- What you expected vs what happened

## Code style

- TypeScript strict mode is enforced — no `any` without explicit justification
- No comments that explain what the code does — only comments that explain *why* (non-obvious invariants, workarounds, etc.)
- Prefer explicit types on exported functions; inference is fine internally
- No trailing whitespace, no unused imports

`tsc --noEmit` must pass before any PR is merged.

## Questions?

Open a GitHub Discussion or an issue tagged `question`.
