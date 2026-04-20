/**
 * Integration tests — call the real petstore3 API with a generated SDK.
 *
 * Skipped by default. Run with:
 *   RUN_INTEGRATION_TESTS=1 bun run test:integration
 */
import { test, expect } from 'bun:test';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { loadSpec, normalizeSpec, buildIR } from '@sdk-forge/core';
import { generateTypeScript } from '@sdk-forge/generator-typescript';

const SKIP = !process.env.RUN_INTEGRATION_TESTS;
const PETSTORE3_BASE = 'https://petstore3.swagger.io/api/v3';
const SPECS = join(import.meta.dir, '../../specs');

test.skipIf(SKIP)('generates petstore3 SDK, imports it, and calls real API', async () => {
  // ── Generate ────────────────────────────────────────────────────────────
  const raw = await loadSpec(join(SPECS, 'petstore3-official.json'));
  const normalized = await normalizeSpec(raw);
  const ir = buildIR(normalized);
  const files = await generateTypeScript(ir, { target: 'backend' });

  // ── Write to temp dir ───────────────────────────────────────────────────
  const outDir = join(tmpdir(), `sdk-forge-integration-${Date.now()}`);
  try {
    for (const file of files) {
      const fullPath = join(outDir, file.path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, 'utf-8');
    }

    // ── Import generated client (Bun runs TS directly) ──────────────────
    const exports = await import(join(outDir, 'src/index.ts')) as Record<string, unknown>;

    // Find the generated client class — ends with "Client"
    const ClientClass = Object.values(exports).find(
      v => typeof v === 'function' && v.name.endsWith('Client'),
    ) as new (opts: { baseUrl: string }) => Record<string, (...args: unknown[]) => Promise<unknown>>;

    expect(ClientClass).toBeDefined();

    const client = new ClientClass({ baseUrl: PETSTORE3_BASE });

    // ── Call real endpoints ──────────────────────────────────────────────

    // GET /pet/{petId} — pet ID 1 is reliably present in the petstore sandbox
    const pet = await client.getPetById(1);
    expect(pet).toMatchObject({ id: 1 });
    expect(typeof (pet as any).name).toBe('string');

  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}, 20_000);
