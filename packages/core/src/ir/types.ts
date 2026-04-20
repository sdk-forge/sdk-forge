export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ApiSpec {
  info: ApiInfo;
  servers: Server[];
  operations: Operation[];
  types: TypeDef[];
  auth: AuthScheme[];
}

export interface ApiInfo {
  title: string;
  version: string;
  description?: string;
}

export interface Server {
  url: string;
  description?: string;
}

export interface Operation {
  id: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: ResponseDef[];
  authSchemes?: string[];
  tags?: string[];
  pagination?: PaginationConfig;
  deprecated?: boolean;
}

export type ParameterLocation = 'path' | 'query' | 'header' | 'cookie';

export interface Parameter {
  name: string;
  in: ParameterLocation;
  required: boolean;
  description?: string;
  schema: TypeRef;
}

export interface RequestBody {
  required: boolean;
  contentType: string;
  schema: TypeRef;
}

export interface ResponseDef {
  statusCode: number | 'default';
  description?: string;
  contentType?: string;
  schema?: TypeRef;
}

export type TypeRef =
  | { kind: 'named'; name: string }
  | { kind: 'primitive'; primitive: PrimitiveType; nullable?: boolean }
  | { kind: 'array'; items: TypeRef; nullable?: boolean }
  | { kind: 'record'; values: TypeRef; nullable?: boolean }
  | { kind: 'unknown' };

export type PrimitiveType = 'string' | 'number' | 'integer' | 'boolean';

export interface TypeDef {
  name: string;
  description?: string;
  nullable: boolean;
  def: ObjectTypeDef | EnumTypeDef | UnionTypeDef | AliasTypeDef;
}

export interface ObjectTypeDef {
  kind: 'object';
  properties: Property[];
}

export interface Property {
  name: string;
  description?: string;
  required: boolean;
  schema: TypeRef;
}

export interface EnumTypeDef {
  kind: 'enum';
  values: string[];
}

export interface UnionTypeDef {
  kind: 'union';
  variants: TypeRef[];
}

export interface AliasTypeDef {
  kind: 'alias';
  target: TypeRef;
}

export type AuthSchemeKind = 'bearer' | 'apiKey' | 'basic' | 'oauth2';

export interface AuthScheme {
  name: string;
  kind: AuthSchemeKind;
  description?: string;
  in?: 'header' | 'query';
  paramName?: string;
}

export type PaginationKind = 'cursor' | 'offset' | 'link-header';

export interface PaginationConfig {
  kind: PaginationKind;
  cursorParam?: string;
  cursorResponseField?: string;
  pageParam?: string;
  limitParam?: string;
}
