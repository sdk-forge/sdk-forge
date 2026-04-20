import type { SourceFile } from 'ts-morph';
import type { TypeDef, TypeRef } from '@sdk-forge/core';

export function emitTypes(file: SourceFile, types: TypeDef[]): void {
  for (const type of types) {
    const docs = type.description ? [type.description] : [];

    if (type.def.kind === 'enum') {
      file.addEnum({
        name: type.name,
        isExported: true,
        docs,
        members: type.def.values.map(v => ({
          name: toEnumMemberName(v),
          value: v,
        })),
      });
    } else if (type.def.kind === 'object') {
      file.addInterface({
        name: type.name,
        isExported: true,
        docs,
        properties: type.def.properties.map(p => ({
          name: p.name,
          type: typeRefToString(p.schema),
          hasQuestionToken: !p.required,
          docs: p.description ? [p.description] : [],
        })),
      });
    } else if (type.def.kind === 'union') {
      file.addTypeAlias({
        name: type.name,
        isExported: true,
        docs,
        type: type.def.variants.map(typeRefToString).join(' | ') || 'unknown',
      });
    } else if (type.def.kind === 'alias') {
      file.addTypeAlias({
        name: type.name,
        isExported: true,
        docs,
        type: typeRefToString(type.def.target),
      });
    }
  }
}

export function typeRefToString(ref: TypeRef): string {
  switch (ref.kind) {
    case 'named':
      return ref.name;
    case 'unknown':
      return 'unknown';
    case 'primitive': {
      const base = ref.primitive === 'integer' ? 'number' : ref.primitive;
      return ref.nullable ? `${base} | null` : base;
    }
    case 'array': {
      const inner = typeRefToString(ref.items);
      const arr = inner.includes('|') ? `(${inner})[]` : `${inner}[]`;
      return ref.nullable ? `${arr} | null` : arr;
    }
    case 'record': {
      const inner = typeRefToString(ref.values);
      const rec = `Record<string, ${inner}>`;
      return ref.nullable ? `${rec} | null` : rec;
    }
  }
}

function toEnumMemberName(value: string): string {
  const upper = value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return /^\d/.test(upper) ? `_${upper}` : upper;
}
