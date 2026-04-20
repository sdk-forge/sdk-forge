# sdk-forge Architecture

## Goals and Non-Goals

**Goals:**
- Generate production-quality, idiomatic TypeScript SDKs from OpenAPI 3.x specs
- Produce SDKs that feel hand-written, not mechanical
- Zero external runtime dependencies in generated SDKs
- Distinguish between frontend and backend SDK targets
- Extensible to additional languages without touching the core

**Non-Goals (MVP):**
- OpenAPI 2.x (Swagger) support
- Pagination helpers (Phase 2)
- Streaming support (Phase 2)
- Python, Go, or other language generators (Phase 2)
- MCP target (on roadmap, not MVP)
- Hosted platform

---

## Pipeline Overview

```
OpenAPI YAML / JSON file
         │
         ▼
   ┌─────────────┐
   │  Spec Loader │  packages/core/src/loader/
   │              │  • Reads YAML or JSON from disk
   │              │  • Returns raw OpenAPI.Document
   └──────┬───────┘
          │
          ▼
   ┌─────────────────┐
   │   Normalizer     │  packages/core/src/normalizer/
   │                  │  • Resolves $refs (swagger-parser)
   │                  │  • Validates OpenAPI 3.x
   │                  │  • Returns fully-dereferenced spec
   └──────┬───────────┘
          │
          ▼
   ┌─────────────┐
   │  IR Builder  │  packages/core/src/ir/builder.ts
   │              │  • Converts spec → ApiSpec (IR)
   │              │  • Normalizes type names, merges allOf
   │              │  • Derives operation IDs when missing
   └──────┬───────┘
          │
          ▼
   ┌──────────────────────────┐
   │  TypeScript Generator     │  packages/generator-typescript/
   │                           │  • AST-based (ts-morph)
   │  ┌──────────────────┐     │  • Emits: client class, types, index
   │  │  Types Emitter   │     │  • Bundles runtime: fetcher, auth, errors
   │  └──────────────────┘     │  • Target-aware: frontend vs backend
   │  ┌──────────────────┐     │
   │  │  Client Emitter  │     │
   │  └──────────────────┘     │
   └──────┬────────────────────┘
          │
          ▼
   Generated TypeScript SDK (on disk)
   ├── src/
   │   ├── index.ts
   │   ├── client.ts        ← generated
   │   ├── types/index.ts   ← generated
   │   └── core/
   │       ├── fetcher.ts   ← bundled runtime
   │       ├── auth.ts      ← bundled runtime
   │       └── errors.ts    ← bundled runtime
   ├── package.json
   └── tsconfig.json
```

---

## Intermediate Representation (IR)

The IR is the heart of the tool. It normalizes OpenAPI's inconsistencies into a clean, language-agnostic model. Every generator consumes the IR — not the raw spec.

### Why a separate IR?

OpenAPI is a document format designed for documentation, not code generation. It has many inconsistencies: `allOf` merging, `nullable` vs `oneOf` with null, missing `operationId`, inconsistent use of `required`, mixed `$ref` and inline schemas. The IR normalizes all of this before any generator sees it.

### ApiSpec

```typescript
interface ApiSpec {
  info: ApiInfo;            // title, version, description
  servers: Server[];        // base URLs
  operations: Operation[];  // all HTTP operations
  types: TypeDef[];         // all named types (deduplicated)
  auth: AuthScheme[];       // security scheme definitions
}
```

### Operation

```typescript
interface Operation {
  id: string;               // operationId or derived from method+path
  method: HttpMethod;       // GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
  path: string;             // /pets/{petId}
  parameters: Parameter[];  // path, query, header params
  requestBody?: RequestBody;
  responses: ResponseDef[];
  authSchemes?: string[];   // which security schemes are required
  pagination?: PaginationConfig; // enriched from IR analysis (Phase 2)
  deprecated?: boolean;
}
```

### TypeRef

`TypeRef` is the type system. Every schema in the spec resolves to a `TypeRef`:

```typescript
type TypeRef =
  | { kind: 'named'; name: string }               // → SomeInterface
  | { kind: 'primitive'; primitive: PrimitiveType } // → string, number, boolean
  | { kind: 'array'; items: TypeRef }             // → Item[]
  | { kind: 'record'; values: TypeRef }           // → Record<string, V>
  | { kind: 'unknown' };                          // → unknown
```

Named types are registered in `ApiSpec.types` exactly once (deduplicated by name). Inline schemas are assigned generated names based on their usage context (e.g., `CreatePetRequest`, `GetPetResponse`).

### TypeDef

```typescript
interface TypeDef {
  name: string;
  def:
    | { kind: 'object'; properties: Property[] }
    | { kind: 'enum'; values: string[] }
    | { kind: 'union'; variants: TypeRef[] }
    | { kind: 'alias'; target: TypeRef };
}
```

---

## Code Generation Approach

### AST-based, not template-based

sdk-forge uses [ts-morph](https://ts-morph.com/) to generate TypeScript via the TypeScript compiler's AST. Template-based generation (Handlebars, Jinja, etc.) has fundamental problems:

- Formatting is manual — inconsistent whitespace, trailing commas, etc.
- Conditional output (optional params, auth, imports) requires messy logic in templates
- Type safety of the template variables is lost
- Hard to maintain as output patterns evolve

With ts-morph, we add structured AST nodes (classes, methods, properties, imports) and call `formatText()`. The output is always correctly formatted TypeScript.

### Emitter structure

Each emitter is a function that takes a `SourceFile` (ts-morph) and writes nodes into it:

- `emitTypes(file, types)` — writes `interface` and `enum` declarations
- `emitClient(file, spec, options)` — writes the main client class

The generator orchestrates emitters, then collects the in-memory files via `project.getSourceFiles()`.

---

## Frontend vs Backend Target

OpenAPI specs don't capture the intended runtime environment of the SDK consumer. sdk-forge adds an explicit `--target frontend|backend` flag.

| Concern | Frontend | Backend |
|---------|----------|---------|
| Fetch API | `window.fetch` (built-in) | `fetch` (Node 18+, or undici) |
| Auth secrets | Not allowed — no API keys in browser | Full support |
| Auth approach | OAuth tokens, session cookies | Bearer tokens, API keys, Basic |
| Distribution | Can be bundled by Vite/webpack | Node.js module |

In practice, the generated `src/core/fetcher.ts` differs by target, and the `AuthConfig` type restricts available auth methods for frontend targets.

**Why this matters:** A backend SDK that gets accidentally used in a browser bundle leaks API keys. By making the target explicit at generation time, sdk-forge can emit TypeScript types that make unsafe patterns a compile error.

---

## Bundled Runtime

Generated SDKs have zero external dependencies. The `src/core/` folder contains the complete runtime:

- `fetcher.ts` — HTTP client wrapping `fetch`. Handles status codes, JSON serialization, and throws `ApiError` on non-2xx.
- `auth.ts` — `AuthConfig` type union and `applyAuth()` function that injects auth into request headers or query params.
- `errors.ts` — `ApiError` class with `status`, `statusText`, and `body`.

These files are embedded as string constants in the generator package (`src/runtime-content.ts`) and written verbatim to the output directory. This ensures the CLI works correctly when compiled to a single binary with `bun build --compile`.

---

## CLI Reference

```
sdk-forge generate --spec <path> [options]

Options:
  --spec     Path to OpenAPI spec file (YAML or JSON)  [required]
  --lang     Target language (default: typescript)
  --target   SDK target: frontend or backend (default: backend)
  --output   Output directory (default: ./sdk)

sdk-forge validate --spec <path>
  Validates the spec and prints a summary of what would be generated.
```

### Example

```bash
# Generate a backend TypeScript SDK
sdk-forge generate --spec ./openapi.yaml --lang typescript --output ./my-api-sdk

# Generate a browser-safe frontend SDK
sdk-forge generate --spec ./openapi.yaml --lang typescript --target frontend --output ./my-api-sdk-browser

# Validate before generating
sdk-forge validate --spec ./openapi.yaml
```

---

## Adding a New Generator

Each language generator is a separate package (`packages/generator-<lang>`). To add one:

1. Create `packages/generator-<lang>/` with its own `package.json` and `tsconfig.json`
2. Add `@sdk-forge/core` as a dependency
3. Export a function with this signature:
   ```typescript
   export async function generate<Lang>(
     spec: ApiSpec,
     options: GeneratorOptions
   ): Promise<GeneratedFile[]>
   ```
   where `GeneratedFile = { path: string; content: string }`.
4. Register the new language in `packages/cli/src/index.ts`

The IR handles all the hard spec-parsing work. The generator only needs to know how to express the IR in the target language.

---

## Monorepo Structure

```
sdk-forge/
├── packages/
│   ├── cli/                         # npm: sdk-forge
│   │   └── src/index.ts             # CLI entry (citty)
│   ├── core/                        # npm: @sdk-forge/core
│   │   └── src/
│   │       ├── loader/              # YAML/JSON loading
│   │       ├── normalizer/          # $ref resolution (swagger-parser)
│   │       └── ir/                  # IR types + builder
│   └── generator-typescript/        # npm: @sdk-forge/generator-typescript
│       └── src/
│           ├── emitters/            # ts-morph emitters
│           ├── runtime-content.ts   # Embedded runtime source strings
│           └── generator.ts         # Main entry point
├── specs/
│   ├── petstore.yaml               # Canonical test spec
│   └── synthetic/
│       ├── pagination.yaml         # Pagination patterns
│       └── auth.yaml               # Auth scheme patterns
└── docs/
    └── ARCHITECTURE.md             # This file
```

**Workspace:** Bun workspaces. Inter-package references use `workspace:*`. All packages are `"type": "module"` with ESNext output.

---

## Phase 2 Roadmap

- **Python generator** — second language target
- **Pagination helpers** — detect cursor/offset patterns from the IR, emit `paginate()` async iterators
- **Streaming** — SSE and chunked response support
- **MCP target** — generate MCP tool definitions from the same IR
- **GitHub Action** — auto-regenerate SDK on spec change
- **Retry + timeout** — configurable in the bundled fetcher
- **Hosted platform** — cloud dashboard, CI/CD integration, npm publishing
