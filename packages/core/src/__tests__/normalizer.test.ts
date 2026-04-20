import { describe, test, expect } from 'bun:test';
import { join } from 'node:path';
import { loadSpec } from '../loader/index.js';
import { normalizeSpec } from '../normalizer/index.js';

const SPECS = join(import.meta.dir, '../../../../specs');

describe('normalizeSpec', () => {
  test('produces a valid OpenAPI 3.x document', async () => {
    const raw = await loadSpec(join(SPECS, 'petstore.yaml'));
    const spec = await normalizeSpec(raw);
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe('Petstore');
    expect(spec.paths).toBeDefined();
    expect(Object.keys(spec.paths!).length).toBeGreaterThan(0);
  });

  test('preserves component schemas (does not inline $refs)', async () => {
    const raw = await loadSpec(join(SPECS, 'petstore.yaml'));
    const spec = await normalizeSpec(raw);
    expect(spec.components?.schemas).toBeDefined();
    const schemaNames = Object.keys(spec.components!.schemas!);
    expect(schemaNames).toContain('Pet');
    expect(schemaNames).toContain('PetStatus');
    expect(schemaNames).toContain('NewPet');
  });

  test('rejects Swagger 2.x specs', async () => {
    const swagger2 = { swagger: '2.0', info: { title: 'Test', version: '1.0' }, paths: {} };
    await expect(normalizeSpec(swagger2 as any)).rejects.toThrow('OpenAPI 3.x');
  });

  test('loads JSON specs', async () => {
    const raw = await loadSpec(join(SPECS, 'petstore3-official.json'));
    const spec = await normalizeSpec(raw);
    expect(spec.openapi).toMatch(/^3\./);
  });
});
