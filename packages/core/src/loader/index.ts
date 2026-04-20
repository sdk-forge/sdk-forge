import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { OpenAPI } from 'openapi-types';

export async function loadSpec(filePath: string): Promise<OpenAPI.Document> {
  const content = await readFile(filePath, 'utf-8');
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'json') {
    return JSON.parse(content) as OpenAPI.Document;
  }
  return parseYaml(content) as OpenAPI.Document;
}
