# Known Issues

## Open

_None yet._

---

## Resolved

### KI-001 · Shared schemas duplicated in generated types
**Severity:** Medium  
**Area:** `packages/core/src/ir/builder.ts`, `packages/core/src/normalizer/index.ts`

**Fix applied:** Switched `SwaggerParser.dereference()` to `bundle()` in the normalizer so internal `$ref`s are preserved. The IR builder now does a two-pass approach: pre-register all `components/schemas` names upfront, then build their `TypeDef`s eagerly before processing operations. When `resolveSchema` encounters a `$ref`, it returns `{ kind: 'named', name }` immediately instead of inlining the schema. Result: 22 generated types → 8 for the petstore spec; shared schemas like `PetStatus`, `Pet`, and `Order` appear exactly once.
