import { Scope, type SourceFile } from 'ts-morph';
import type { ApiSpec, Operation, TypeRef } from '@sdk-forge/core';
import { typeRefToString } from './types.emitter.js';
import type { GeneratorOptions } from '../generator.js';

export function emitClient(file: SourceFile, spec: ApiSpec, options: GeneratorOptions): void {
  file.addImportDeclaration({
    moduleSpecifier: './core/fetcher.js',
    namedImports: ['fetcher'],
  });
  file.addImportDeclaration({
    moduleSpecifier: './core/auth.js',
    namedImports: ['applyAuth'],
    isTypeOnly: false,
  });
  file.addImportDeclaration({
    moduleSpecifier: './core/auth.js',
    namedImports: ['AuthConfig'],
    isTypeOnly: true,
  });

  if (spec.types.length > 0) {
    file.addImportDeclaration({
      moduleSpecifier: './types/index.js',
      namedImports: spec.types.map(t => t.name),
      isTypeOnly: true,
    });
  }

  const className = `${pascalCase(spec.info.title)}Client`;
  const defaultBaseUrl = spec.servers[0]?.url ?? 'http://localhost';

  const clientClass = file.addClass({
    name: className,
    isExported: true,
    docs: [`Client for the ${spec.info.title} API (v${spec.info.version}).`],
  });

  clientClass.addProperty({ name: 'baseUrl', scope: Scope.Private, isReadonly: true, type: 'string' });
  clientClass.addProperty({ name: 'auth', scope: Scope.Private, isReadonly: true, type: 'AuthConfig | undefined' });

  clientClass.addConstructor({
    parameters: [
      {
        name: 'options',
        type: `{ baseUrl?: string; auth?: AuthConfig }`,
        initializer: '{}',
      },
    ],
    statements: [
      `this.baseUrl = options.baseUrl ?? '${defaultBaseUrl}';`,
      'this.auth = options.auth;',
    ],
  });

  for (const op of spec.operations) {
    emitOperation(clientClass, op, options);
  }
}

function emitOperation(
  clientClass: ReturnType<SourceFile['addClass']>,
  op: Operation,
  _options: GeneratorOptions,
): void {
  const pathParams = op.parameters.filter(p => p.in === 'path');
  const queryParams = op.parameters.filter(p => p.in === 'query');
  const hasBody = !!op.requestBody;

  const successResponse = op.responses.find(r => {
    const code = r.statusCode;
    return code !== 'default' && code >= 200 && code < 300;
  });
  const returnType = successResponse?.schema ? typeRefToString(successResponse.schema) : 'void';

  const params: Array<{ name: string; type: string; hasQuestionToken?: boolean }> = [
    ...pathParams.map(p => ({ name: camelCase(p.name), type: typeRefToString(p.schema) })),
  ];

  if (hasBody) {
    params.push({
      name: 'body',
      type: op.requestBody!.schema ? typeRefToString(op.requestBody!.schema) : 'unknown',
      hasQuestionToken: !op.requestBody!.required,
    });
  }

  const optionalQueryParams = queryParams.filter(p => !p.required);
  const requiredQueryParams = queryParams.filter(p => p.required);

  for (const p of requiredQueryParams) {
    params.push({ name: camelCase(p.name), type: typeRefToString(p.schema) });
  }

  if (optionalQueryParams.length > 0) {
    const propsType = optionalQueryParams
      .map(p => `${camelCase(p.name)}?: ${typeRefToString(p.schema)}`)
      .join('; ');
    params.push({ name: 'query', type: `{ ${propsType} }`, hasQuestionToken: true });
  }

  // Build method body
  const urlPath = op.path.replace(/\{([^}]+)\}/g, (_, name: string) => `\${${camelCase(name)}}`);
  const statements: string[] = [
    `const headers: Record<string, string> = {};`,
    `const queryParams = new URLSearchParams();`,
    `if (this.auth) applyAuth(headers, queryParams, this.auth);`,
  ];

  for (const p of requiredQueryParams) {
    statements.push(`queryParams.set('${p.name}', String(${camelCase(p.name)}));`);
  }

  if (optionalQueryParams.length > 0) {
    for (const p of optionalQueryParams) {
      const key = camelCase(p.name);
      statements.push(`if (query?.${key} !== undefined) queryParams.set('${p.name}', String(query.${key}));`);
    }
  }

  statements.push(
    `const qs = queryParams.size > 0 ? \`?\${queryParams.toString()}\` : '';`,
    `const url = \`\${this.baseUrl}${urlPath}\${qs}\`;`,
  );

  const fetchArgs = [`method: '${op.method}'`, 'url', 'headers'];
  if (hasBody) fetchArgs.push('body');

  statements.push(
    `const response = await fetcher<${returnType}>({ ${fetchArgs.join(', ')} });`,
    returnType === 'void' ? '' : `return response.data;`,
  );

  clientClass.addMethod({
    name: camelCase(op.id),
    isAsync: true,
    returnType: `Promise<${returnType}>`,
    parameters: params,
    docs: [op.summary ?? op.description ?? ''].filter(Boolean),
    statements,
  });
}

function pascalCase(str: string): string {
  return str
    .replace(/[-_/{}]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function camelCase(str: string): string {
  const pascal = pascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
