import type { OpenAPIV3 } from 'openapi-types';
import type {
  ApiSpec,
  Operation,
  TypeDef,
  TypeRef,
  AuthScheme,
  Parameter,
  RequestBody,
  ResponseDef,
  Property,
} from './types.js';

export function buildIR(spec: OpenAPIV3.Document): ApiSpec {
  const types: TypeDef[] = [];
  const typeNames = new Set<string>();

  // Maps "#/components/schemas/Foo" → IR type name "Foo"
  const refToName = new Map<string, string>();
  // Tracks components currently being built (cycle guard)
  const pending = new Set<string>();
  // Tracks fully built components
  const built = new Set<string>();

  // Pass 1: register names for all component schemas upfront so forward refs resolve correctly
  for (const schemaName of Object.keys(spec.components?.schemas ?? {})) {
    const irName = pascalCase(schemaName);
    typeNames.add(irName);
    refToName.set(`#/components/schemas/${schemaName}`, irName);
  }

  // Pass 2: build TypeDefs for every component schema (eagerly — consumers expect all types)
  for (const ref of refToName.keys()) {
    buildComponent(ref);
  }

  // ── Schema resolution ─────────────────────────────────────────────────────

  function resolveSchema(
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
    hint?: string,
  ): TypeRef {
    if ('$ref' in schema) {
      const name = refToName.get(schema.$ref);
      if (!name) return { kind: 'unknown' };
      buildComponent(schema.$ref); // ensure TypeDef exists
      return { kind: 'named', name };
    }

    return resolveInline(schema, hint);
  }

  function resolveInline(s: OpenAPIV3.SchemaObject, hint?: string): TypeRef {
    if (s.oneOf || s.anyOf) {
      const variants = (s.oneOf ?? s.anyOf ?? []).map((v, i) =>
        resolveSchema(v, hint ? `${hint}Variant${i}` : undefined),
      );
      const name = uniqueName(hint ?? 'Union', typeNames);
      types.push({ name, nullable: !!s.nullable, description: s.description, def: { kind: 'union', variants } });
      return { kind: 'named', name };
    }

    if (s.allOf) {
      return resolveInline(mergeAllOf(s.allOf), hint);
    }

    if (s.type === 'object' || s.properties) {
      const name = uniqueName(hint ?? 'Object', typeNames);
      const properties = buildProperties(name, s);
      types.push({ name, nullable: !!s.nullable, description: s.description, def: { kind: 'object', properties } });
      return { kind: 'named', name };
    }

    if (s.enum) {
      const name = uniqueName(hint ?? 'Enum', typeNames);
      types.push({ name, nullable: !!s.nullable, description: s.description, def: { kind: 'enum', values: s.enum.map(String) } });
      return { kind: 'named', name };
    }

    if (s.type === 'array' && s.items) {
      return { kind: 'array', items: resolveSchema(s.items, hint ? `${hint}Item` : undefined), nullable: !!s.nullable };
    }

    if (s.additionalProperties && typeof s.additionalProperties === 'object') {
      return {
        kind: 'record',
        values: resolveSchema(s.additionalProperties as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, hint ? `${hint}Value` : undefined),
        nullable: !!s.nullable,
      };
    }

    if (s.type === 'string') return { kind: 'primitive', primitive: 'string', nullable: !!s.nullable };
    if (s.type === 'number') return { kind: 'primitive', primitive: 'number', nullable: !!s.nullable };
    if (s.type === 'integer') return { kind: 'primitive', primitive: 'integer', nullable: !!s.nullable };
    if (s.type === 'boolean') return { kind: 'primitive', primitive: 'boolean', nullable: !!s.nullable };

    return { kind: 'unknown' };
  }

  // ── Component builder ─────────────────────────────────────────────────────

  function buildComponent(ref: string): void {
    if (built.has(ref) || pending.has(ref)) return;
    pending.add(ref);

    const schemaName = ref.replace('#/components/schemas/', '');
    const raw = spec.components?.schemas?.[schemaName];
    if (raw) {
      const irName = refToName.get(ref)!;
      buildNamedType(irName, raw);
    }

    pending.delete(ref);
    built.add(ref);
  }

  function buildNamedType(name: string, schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject): void {
    if ('$ref' in schema) {
      const targetName = refToName.get(schema.$ref);
      if (targetName) {
        buildComponent(schema.$ref);
        types.push({ name, nullable: false, def: { kind: 'alias', target: { kind: 'named', name: targetName } } });
      }
      return;
    }

    const s = schema;

    if (s.oneOf || s.anyOf) {
      const variants = (s.oneOf ?? s.anyOf ?? []).map((v, i) => resolveSchema(v, `${name}Variant${i}`));
      types.push({ name, nullable: !!s.nullable, description: s.description, def: { kind: 'union', variants } });
      return;
    }

    if (s.allOf) {
      buildNamedType(name, mergeAllOf(s.allOf));
      return;
    }

    if (s.type === 'object' || s.properties) {
      const properties = buildProperties(name, s);
      types.push({ name, nullable: !!s.nullable, description: s.description, def: { kind: 'object', properties } });
      return;
    }

    if (s.enum) {
      types.push({ name, nullable: !!s.nullable, description: s.description, def: { kind: 'enum', values: s.enum.map(String) } });
      return;
    }

    if (s.type === 'array' && s.items) {
      types.push({ name, nullable: !!s.nullable, description: s.description, def: { kind: 'alias', target: resolveSchema(s.items, `${name}Item`) } });
      return;
    }

    // Primitive named type — emit as alias
    const primitiveMap: Record<string, TypeRef> = {
      string: { kind: 'primitive', primitive: 'string' },
      number: { kind: 'primitive', primitive: 'number' },
      integer: { kind: 'primitive', primitive: 'integer' },
      boolean: { kind: 'primitive', primitive: 'boolean' },
    };
    const primitive = s.type ? primitiveMap[s.type] : undefined;
    if (primitive) {
      types.push({ name, nullable: !!s.nullable, description: s.description, def: { kind: 'alias', target: primitive } });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function buildProperties(parentName: string, s: OpenAPIV3.SchemaObject): Property[] {
    return Object.entries(s.properties ?? {}).map(([propName, propSchema]) => ({
      name: propName,
      required: (s.required ?? []).includes(propName),
      schema: resolveSchema(propSchema, `${parentName}${pascalCase(propName)}`),
      description: '$ref' in propSchema ? undefined : propSchema.description,
    }));
  }

  // Merge allOf by collecting properties from inline schemas; skip $ref items
  // (referenced types are captured via resolveSchema separately)
  function mergeAllOf(
    schemas: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[],
  ): OpenAPIV3.SchemaObject {
    const merged: OpenAPIV3.SchemaObject = { type: 'object', properties: {}, required: [] };
    for (const sub of schemas) {
      if ('$ref' in sub) continue;
      Object.assign(merged.properties!, sub.properties ?? {});
      merged.required = [...(merged.required ?? []), ...(sub.required ?? [])];
      if (sub.description && !merged.description) merged.description = sub.description;
    }
    return merged;
  }

  // ── Operations ────────────────────────────────────────────────────────────

  const operations: Operation[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!pathItem) continue;

    const sharedParameters = (pathItem.parameters ?? []) as OpenAPIV3.ParameterObject[];
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

    for (const method of methods) {
      const op = pathItem[method] as OpenAPIV3.OperationObject | undefined;
      if (!op) continue;

      const operationId = op.operationId ?? deriveOperationId(method, path);
      const opIdPascal = pascalCase(operationId);
      const allParams = [...sharedParameters, ...((op.parameters ?? []) as OpenAPIV3.ParameterObject[])];

      const parameters: Parameter[] = allParams.map(p => ({
        name: p.name,
        in: p.in as Parameter['in'],
        required: p.required ?? false,
        description: p.description,
        schema: p.schema
          ? resolveSchema(p.schema, `${opIdPascal}${pascalCase(p.name)}`)
          : { kind: 'primitive', primitive: 'string' },
      }));

      let requestBody: RequestBody | undefined;
      if (op.requestBody) {
        const rb = op.requestBody as OpenAPIV3.RequestBodyObject;
        const jsonContent = rb.content?.['application/json'];
        if (jsonContent?.schema) {
          requestBody = {
            required: rb.required ?? false,
            contentType: 'application/json',
            schema: resolveSchema(jsonContent.schema, `${opIdPascal}Request`),
          };
        }
      }

      const responses: ResponseDef[] = Object.entries(op.responses ?? {}).map(([code, response]) => {
        const res = response as OpenAPIV3.ResponseObject;
        const jsonContent = res.content?.['application/json'];
        return {
          statusCode: code === 'default' ? 'default' : parseInt(code, 10),
          description: res.description,
          contentType: jsonContent ? 'application/json' : undefined,
          schema: jsonContent?.schema ? resolveSchema(jsonContent.schema, `${opIdPascal}Response`) : undefined,
        };
      });

      const authSchemes = op.security?.flatMap(s => Object.keys(s)) ?? [];

      operations.push({
        id: operationId,
        method: method.toUpperCase() as Operation['method'],
        path,
        summary: op.summary,
        description: op.description,
        parameters,
        requestBody,
        responses,
        authSchemes: authSchemes.length > 0 ? authSchemes : undefined,
        tags: op.tags,
        deprecated: op.deprecated,
      });
    }
  }

  // ── Auth schemes ──────────────────────────────────────────────────────────

  const auth: AuthScheme[] = Object.entries(spec.components?.securitySchemes ?? {}).map(([name, scheme]) => {
    const s = scheme as OpenAPIV3.SecuritySchemeObject;
    if (s.type === 'http' && s.scheme === 'bearer') return { name, kind: 'bearer' as const, description: s.description };
    if (s.type === 'apiKey') return { name, kind: 'apiKey' as const, in: s.in as 'header' | 'query', paramName: s.name, description: s.description };
    if (s.type === 'http' && s.scheme === 'basic') return { name, kind: 'basic' as const, description: s.description };
    if (s.type === 'oauth2') return { name, kind: 'oauth2' as const, description: s.description };
    return { name, kind: 'bearer' as const, description: s.description };
  });

  return {
    info: { title: spec.info.title, version: spec.info.version, description: spec.info.description },
    servers: (spec.servers ?? []).map(s => ({ url: s.url, description: s.description })),
    operations,
    types,
    auth,
  };
}

// ── Utilities ───────────────────────────────────────────────────────────────

function uniqueName(hint: string, taken: Set<string>): string {
  const base = pascalCase(hint);
  if (!taken.has(base)) { taken.add(base); return base; }
  let i = 2;
  while (taken.has(`${base}${i}`)) i++;
  const name = `${base}${i}`;
  taken.add(name);
  return name;
}

function pascalCase(str: string): string {
  return str
    .replace(/[-_/{}]/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function deriveOperationId(method: string, path: string): string {
  const parts = path
    .replace(/\{[^}]+\}/g, by => `By${by.slice(1, -1).charAt(0).toUpperCase()}${by.slice(2, -1)}`)
    .split('/')
    .filter(Boolean);
  return method + parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}
