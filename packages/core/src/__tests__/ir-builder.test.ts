import { describe, test, expect, beforeAll } from 'bun:test';
import { join } from 'node:path';
import { loadSpec } from '../loader/index.js';
import { normalizeSpec } from '../normalizer/index.js';
import { buildIR } from '../ir/builder.js';
import type { ApiSpec } from '../ir/types.js';

const PETSTORE = join(import.meta.dir, '../../../../specs/petstore.yaml');

describe('buildIR — petstore spec', () => {
  let ir: ApiSpec;

  beforeAll(async () => {
    const raw = await loadSpec(PETSTORE);
    const normalized = await normalizeSpec(raw);
    ir = buildIR(normalized);
  });

  // ── Operations ────────────────────────────────────────────────────────────

  test('produces 7 operations', () => {
    expect(ir.operations).toHaveLength(7);
  });

  test('operation IDs are correct', () => {
    const ids = ir.operations.map(o => o.id);
    expect(ids).toContain('listPets');
    expect(ids).toContain('createPet');
    expect(ids).toContain('getPet');
    expect(ids).toContain('updatePet');
    expect(ids).toContain('deletePet');
    expect(ids).toContain('createOrder');
    expect(ids).toContain('getOrder');
  });

  test('getPet has correct method and path', () => {
    const op = ir.operations.find(o => o.id === 'getPet')!;
    expect(op.method).toBe('GET');
    expect(op.path).toBe('/pets/{petId}');
  });

  test('getPet has a required integer path param', () => {
    const op = ir.operations.find(o => o.id === 'getPet')!;
    expect(op.parameters).toHaveLength(1);
    const param = op.parameters[0];
    expect(param.name).toBe('petId');
    expect(param.in).toBe('path');
    expect(param.required).toBe(true);
    expect(param.schema).toMatchObject({ kind: 'primitive', primitive: 'integer' });
  });

  test('listPets has two optional query params', () => {
    const op = ir.operations.find(o => o.id === 'listPets')!;
    expect(op.parameters).toHaveLength(2);
    expect(op.parameters.every(p => !p.required)).toBe(true);
    expect(op.parameters[0].in).toBe('query');
  });

  test('createPet has a required request body of type NewPet', () => {
    const op = ir.operations.find(o => o.id === 'createPet')!;
    expect(op.requestBody).toBeDefined();
    expect(op.requestBody!.required).toBe(true);
    expect(op.requestBody!.schema).toEqual({ kind: 'named', name: 'NewPet' });
  });

  test('deletePet has a 204 response with no schema', () => {
    const op = ir.operations.find(o => o.id === 'deletePet')!;
    const resp = op.responses.find(r => r.statusCode === 204);
    expect(resp).toBeDefined();
    expect(resp!.schema).toBeUndefined();
  });

  test('createOrder and getOrder require BearerAuth', () => {
    const createOrder = ir.operations.find(o => o.id === 'createOrder')!;
    const getOrder = ir.operations.find(o => o.id === 'getOrder')!;
    expect(createOrder.authSchemes).toContain('BearerAuth');
    expect(getOrder.authSchemes).toContain('BearerAuth');
  });

  // ── Types ─────────────────────────────────────────────────────────────────

  test('produces exactly 8 deduplicated types', () => {
    expect(ir.types).toHaveLength(8);
  });

  test('no duplicate type names', () => {
    const names = ir.types.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('shared schema names match the spec (not per-operation names)', () => {
    const names = ir.types.map(t => t.name);
    // These are the correct deduplicated names
    expect(names).toContain('PetStatus');
    expect(names).toContain('Pet');
    expect(names).toContain('NewPet');
    expect(names).toContain('PetList');
    expect(names).toContain('OrderStatus');
    expect(names).toContain('Order');
    expect(names).toContain('NewOrder');
    expect(names).toContain('Error');
    // These would appear if deduplication was broken (KI-001 regression check)
    expect(names).not.toContain('ListPetsStatus');
    expect(names).not.toContain('CreatePetRequestStatus');
    expect(names).not.toContain('GetPetResponseStatus');
  });

  test('PetStatus is an enum with correct values', () => {
    const type = ir.types.find(t => t.name === 'PetStatus')!;
    expect(type.def.kind).toBe('enum');
    if (type.def.kind === 'enum') {
      expect(type.def.values).toEqual(['available', 'pending', 'sold']);
    }
  });

  test('Pet is an object with correct properties', () => {
    const type = ir.types.find(t => t.name === 'Pet')!;
    expect(type.def.kind).toBe('object');
    if (type.def.kind === 'object') {
      const props = type.def.properties;
      expect(props.find(p => p.name === 'id')?.required).toBe(true);
      expect(props.find(p => p.name === 'name')?.required).toBe(true);
      expect(props.find(p => p.name === 'tag')?.required).toBe(false);
      // status references the shared PetStatus enum
      expect(props.find(p => p.name === 'status')?.schema).toEqual({ kind: 'named', name: 'PetStatus' });
    }
  });

  test('PetList has an array of Pet items', () => {
    const type = ir.types.find(t => t.name === 'PetList')!;
    expect(type.def.kind).toBe('object');
    if (type.def.kind === 'object') {
      const itemsProp = type.def.properties.find(p => p.name === 'items')!;
      expect(itemsProp.schema).toEqual({ kind: 'array', items: { kind: 'named', name: 'Pet' }, nullable: false });
    }
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  test('has one bearer auth scheme named BearerAuth', () => {
    expect(ir.auth).toHaveLength(1);
    expect(ir.auth[0]).toMatchObject({ name: 'BearerAuth', kind: 'bearer' });
  });

  // ── Info & servers ────────────────────────────────────────────────────────

  test('info is correct', () => {
    expect(ir.info.title).toBe('Petstore');
    expect(ir.info.version).toBe('1.0.0');
  });

  test('has at least one server', () => {
    expect(ir.servers.length).toBeGreaterThan(0);
    expect(ir.servers[0].url).toMatch(/^https?:\/\//);
  });
});
