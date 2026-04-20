export { loadSpec } from './loader/index.js';
export { normalizeSpec } from './normalizer/index.js';
export { buildIR } from './ir/builder.js';
export type {
  ApiSpec,
  ApiInfo,
  Server,
  Operation,
  HttpMethod,
  ParameterLocation,
  Parameter,
  RequestBody,
  ResponseDef,
  TypeRef,
  PrimitiveType,
  TypeDef,
  ObjectTypeDef,
  Property,
  EnumTypeDef,
  UnionTypeDef,
  AliasTypeDef,
  AuthScheme,
  AuthSchemeKind,
  PaginationConfig,
  PaginationKind,
} from './ir/index.js';
