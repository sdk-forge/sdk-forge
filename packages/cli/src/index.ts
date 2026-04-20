#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { loadSpec, normalizeSpec, buildIR } from '@sdk-forge/core';
import { generateTypeScript } from '@sdk-forge/generator-typescript';

const generateCmd = defineCommand({
  meta: {
    name: 'generate',
    description: 'Generate an SDK from an OpenAPI spec',
  },
  args: {
    spec: {
      type: 'string',
      description: 'Path to OpenAPI spec file (YAML or JSON)',
      required: true,
    },
    lang: {
      type: 'string',
      description: 'Target language',
      default: 'typescript',
    },
    target: {
      type: 'string',
      description: 'SDK target environment: frontend or backend',
      default: 'backend',
    },
    output: {
      type: 'string',
      description: 'Output directory',
      default: './sdk',
    },
  },
  async run({ args }) {
    const specPath = resolve(args.spec);
    const outputDir = resolve(args.output);
    const target = args.target as 'frontend' | 'backend';

    if (target !== 'frontend' && target !== 'backend') {
      console.error(`Error: --target must be "frontend" or "backend", got "${args.target}"`);
      process.exit(1);
    }

    console.log(`Loading spec: ${specPath}`);
    const rawSpec = await loadSpec(specPath);

    console.log('Normalizing spec...');
    const normalizedSpec = await normalizeSpec(rawSpec);

    console.log('Building IR...');
    const ir = buildIR(normalizedSpec);

    console.log(`  ${ir.operations.length} operations`);
    console.log(`  ${ir.types.length} types`);
    console.log(`  ${ir.auth.length} auth schemes`);

    if (args.lang !== 'typescript') {
      console.error(`Error: language "${args.lang}" is not supported yet. Only "typescript" is available.`);
      process.exit(1);
    }

    console.log(`Generating TypeScript SDK (target: ${target})...`);
    const files = await generateTypeScript(ir, { target });

    for (const file of files) {
      const fullPath = join(outputDir, file.path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, 'utf-8');
    }

    console.log(`\nDone! Generated ${files.length} files to: ${outputDir}`);
    console.log('\nNext steps:');
    console.log(`  cd ${args.output}`);
    console.log('  bun install  # or npm install');
    console.log('  bun run build');
  },
});

const validateCmd = defineCommand({
  meta: {
    name: 'validate',
    description: 'Validate an OpenAPI spec',
  },
  args: {
    spec: {
      type: 'string',
      description: 'Path to OpenAPI spec file',
      required: true,
    },
  },
  async run({ args }) {
    const specPath = resolve(args.spec);
    console.log(`Validating: ${specPath}`);

    try {
      const rawSpec = await loadSpec(specPath);
      const normalizedSpec = await normalizeSpec(rawSpec);
      const ir = buildIR(normalizedSpec);
      console.log('Valid OpenAPI 3.x spec.');
      console.log(`  Title: ${ir.info.title} v${ir.info.version}`);
      console.log(`  Operations: ${ir.operations.length}`);
      console.log(`  Types: ${ir.types.length}`);
    } catch (err) {
      console.error(`Validation failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  },
});

const main = defineCommand({
  meta: {
    name: 'sdk-forge',
    description: 'Generate production-quality SDKs from OpenAPI specs',
    version: '0.0.1',
  },
  subCommands: {
    generate: generateCmd,
    validate: validateCmd,
  },
});

runMain(main);
