import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI, OpenAPIV3 } from 'openapi-types';

export async function normalizeSpec(doc: OpenAPI.Document): Promise<OpenAPIV3.Document> {
  // bundle() resolves external $refs (files, URLs) but keeps internal #/components/schemas/...
  // refs in place — the IR builder uses those refs to deduplicate shared schemas.
  const bundled = await SwaggerParser.bundle(doc);
  const spec = bundled as OpenAPIV3.Document;

  if (!('openapi' in spec) || !spec.openapi.startsWith('3.')) {
    throw new Error(`sdk-forge requires OpenAPI 3.x. Got: ${'swagger' in spec ? spec.swagger : 'unknown version'}`);
  }

  return spec;
}
