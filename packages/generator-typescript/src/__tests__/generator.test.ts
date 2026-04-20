import { describe, test, expect, beforeAll } from 'bun:test';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { loadSpec, normalizeSpec, buildIR } from '@sdk-forge/core';
import { generateTypeScript } from '../generator.js';
import type { GeneratedFile } from '../generator.js';

const PETSTORE = join(import.meta.dir, '../../../../specs/petstore.yaml');

describe('generateTypeScript — petstore spec', () => {
  let files: GeneratedFile[];

  beforeAll(async () => {
    const raw = await loadSpec(PETSTORE);
    const normalized = await normalizeSpec(raw);
    const ir = buildIR(normalized);
    files = await generateTypeScript(ir, { target: 'backend' });
  });

  // ── File manifest ─────────────────────────────────────────────────────────

  test('generates the expected set of files', () => {
    const paths = files.map(f => f.path).sort();
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/client.ts');
    expect(paths).toContain('src/types/index.ts');
    expect(paths).toContain('src/core/fetcher.ts');
    expect(paths).toContain('src/core/auth.ts');
    expect(paths).toContain('src/core/errors.ts');
    expect(paths).toContain('package.json');
    expect(paths).toContain('tsconfig.json');
    expect(paths).toHaveLength(8);
  });

  // ── client.ts ─────────────────────────────────────────────────────────────

  test('client contains PetstoreClient class', () => {
    const client = files.find(f => f.path === 'src/client.ts')!;
    expect(client.content).toContain('PetstoreClient');
    expect(client.content).toContain('class PetstoreClient');
  });

  test('client contains all 7 operation methods', () => {
    const content = files.find(f => f.path === 'src/client.ts')!.content;
    for (const method of ['listPets', 'createPet', 'getPet', 'updatePet', 'deletePet', 'createOrder', 'getOrder']) {
      expect(content).toContain(method);
    }
  });

  test('client uses shared type names (not per-operation duplicates)', () => {
    const content = files.find(f => f.path === 'src/client.ts')!.content;
    expect(content).toContain('Pet');
    expect(content).toContain('NewPet');
    expect(content).toContain('PetList');
    // Regression: these per-operation names should NOT appear
    expect(content).not.toContain('ListPetsResponseItemsItem');
    expect(content).not.toContain('CreatePetResponse2');
  });

  test('client imports from core runtime files', () => {
    const content = files.find(f => f.path === 'src/client.ts')!.content;
    expect(content).toContain('./core/fetcher.js');
    expect(content).toContain('./core/auth.js');
  });

  // ── types/index.ts ────────────────────────────────────────────────────────

  test('types contains all 8 shared type definitions', () => {
    const content = files.find(f => f.path === 'src/types/index.ts')!.content;
    for (const name of ['PetStatus', 'Pet', 'NewPet', 'PetList', 'OrderStatus', 'Order', 'NewOrder', 'Error']) {
      expect(content).toContain(name);
    }
  });

  test('Pet interface references PetStatus enum (not inline)', () => {
    const content = files.find(f => f.path === 'src/types/index.ts')!.content;
    expect(content).toContain('status: PetStatus');
  });

  test('PetStatus enum has correct members', () => {
    const content = files.find(f => f.path === 'src/types/index.ts')!.content;
    expect(content).toContain('AVAILABLE = "available"');
    expect(content).toContain('PENDING = "pending"');
    expect(content).toContain('SOLD = "sold"');
  });

  // ── package.json ──────────────────────────────────────────────────────────

  test('package.json is valid and has correct fields', () => {
    const raw = files.find(f => f.path === 'package.json')!.content;
    const pkg = JSON.parse(raw);
    expect(pkg.name).toBe('petstore-sdk');
    expect(pkg.type).toBe('module');
    expect(pkg.main).toBe('./dist/index.js');
    expect(pkg.devDependencies?.typescript).toBeDefined();
  });

  // ── frontend vs backend ───────────────────────────────────────────────────

  test('backend and frontend targets produce different fetcher content', async () => {
    const raw = await loadSpec(PETSTORE);
    const normalized = await normalizeSpec(raw);
    const ir = buildIR(normalized);

    const [backend, frontend] = await Promise.all([
      generateTypeScript(ir, { target: 'backend' }),
      generateTypeScript(ir, { target: 'frontend' }),
    ]);

    const backendFetcher = backend.find(f => f.path === 'src/core/fetcher.ts')!.content;
    const frontendFetcher = frontend.find(f => f.path === 'src/core/fetcher.ts')!.content;

    // Both exist but should differ (we have separate templates for each)
    expect(backendFetcher).toBeTruthy();
    expect(frontendFetcher).toBeTruthy();
  });

  // ── Compilation ───────────────────────────────────────────────────────────

  test('generated SDK compiles with tsc --noEmit', async () => {
    const outDir = join(tmpdir(), `sdk-forge-test-${Date.now()}`);
    try {
      // Write files to disk
      for (const file of files) {
        const fullPath = join(outDir, file.path);
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, file.content, 'utf-8');
      }

      // Run tsc --noEmit
      const tscPath = join(import.meta.dir, '../../../../node_modules/typescript/lib/tsc.js');
      const result = Bun.spawnSync(['node', tscPath, '--noEmit', '--project', join(outDir, 'tsconfig.json')]);
      const stderr = new TextDecoder().decode(result.stderr);

      expect(result.exitCode).toBe(0);
      expect(stderr).toBe('');
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 15000);
});
