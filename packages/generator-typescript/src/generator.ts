import { Project } from 'ts-morph';
import type { ApiSpec } from '@sdk-forge/core';
import { emitTypes } from './emitters/types.emitter.js';
import { emitClient } from './emitters/client.emitter.js';
import { AUTH_TS, ERRORS_TS, BACKEND_FETCHER_TS, FRONTEND_FETCHER_TS } from './runtime-content.js';

export interface GeneratorOptions {
  target: 'frontend' | 'backend';
  packageName?: string;
  packageVersion?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export async function generateTypeScript(spec: ApiSpec, options: GeneratorOptions): Promise<GeneratedFile[]> {
  const project = new Project({ useInMemoryFileSystem: true });

  // Types
  const typesFile = project.createSourceFile('/src/types/index.ts');
  emitTypes(typesFile, spec.types);

  // Client
  const clientFile = project.createSourceFile('/src/client.ts');
  emitClient(clientFile, spec, options);

  // Index re-exports
  const indexFile = project.createSourceFile('/src/index.ts');
  indexFile.addExportDeclarations([
    { moduleSpecifier: './client.js' },
    { moduleSpecifier: './types/index.js' },
    { moduleSpecifier: './core/errors.js' },
  ]);

  // Format and collect generated files
  const files: GeneratedFile[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    sourceFile.formatText({ indentSize: 2 });
    files.push({
      path: sourceFile.getFilePath().slice(1), // strip leading /
      content: sourceFile.getFullText(),
    });
  }

  // Static runtime files (bundled, no external deps)
  files.push({ path: 'src/core/errors.ts', content: ERRORS_TS });
  files.push({ path: 'src/core/auth.ts', content: AUTH_TS });
  files.push({
    path: 'src/core/fetcher.ts',
    content: options.target === 'frontend' ? FRONTEND_FETCHER_TS : BACKEND_FETCHER_TS,
  });

  // package.json for the generated SDK
  const pkgName = options.packageName ?? `${kebabCase(spec.info.title)}-sdk`;
  files.push({
    path: 'package.json',
    content: JSON.stringify({
      name: pkgName,
      version: options.packageVersion ?? spec.info.version,
      type: 'module',
      main: './dist/index.js',
      types: './dist/index.d.ts',
      exports: { '.': { import: './dist/index.js', types: './dist/index.d.ts' } },
      scripts: { build: 'tsc', typecheck: 'tsc --noEmit' },
      devDependencies: { typescript: '^5.5.0' },
    }, null, 2) + '\n',
  });

  // tsconfig.json for the generated SDK
  files.push({
    path: 'tsconfig.json',
    content: JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        outDir: 'dist',
        rootDir: 'src',
      },
      include: ['src/**/*'],
    }, null, 2) + '\n',
  });

  return files;
}

function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
