export const ERRORS_TS = `
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
  ) {
    super(\`HTTP \${status}: \${statusText}\`);
    this.name = 'ApiError';
  }
}
`.trimStart();

export const AUTH_TS = `
export type AuthConfig =
  | { kind: 'bearer'; token: string }
  | { kind: 'apiKey'; in: 'header' | 'query'; name: string; value: string }
  | { kind: 'basic'; username: string; password: string };

export function applyAuth(
  headers: Record<string, string>,
  params: URLSearchParams,
  auth: AuthConfig,
): void {
  if (auth.kind === 'bearer') {
    headers['Authorization'] = \`Bearer \${auth.token}\`;
  } else if (auth.kind === 'apiKey') {
    if (auth.in === 'header') {
      headers[auth.name] = auth.value;
    } else {
      params.set(auth.name, auth.value);
    }
  } else if (auth.kind === 'basic') {
    const encoded = btoa(\`\${auth.username}:\${auth.password}\`);
    headers['Authorization'] = \`Basic \${encoded}\`;
  }
}
`.trimStart();

// Backend: uses node:fetch (Node 18+), allows secret keys in headers
export const BACKEND_FETCHER_TS = `
import { ApiError } from './errors.js';

export interface RequestOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
}

export async function fetcher<T>(options: RequestOptions): Promise<ApiResponse<T>> {
  const response = await fetch(options.url, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
    throw new ApiError(response.status, response.statusText, body);
  }

  if (response.status === 204) {
    return { data: undefined as T, status: response.status };
  }

  const data = await response.json() as T;
  return { data, status: response.status };
}
`.trimStart();

// Frontend: same interface but enforces no secret keys via TypeScript (runtime is identical)
export const FRONTEND_FETCHER_TS = `
import { ApiError } from './errors.js';

export interface RequestOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
}

export async function fetcher<T>(options: RequestOptions): Promise<ApiResponse<T>> {
  const response = await fetch(options.url, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
    throw new ApiError(response.status, response.statusText, body);
  }

  if (response.status === 204) {
    return { data: undefined as T, status: response.status };
  }

  const data = await response.json() as T;
  return { data, status: response.status };
}
`.trimStart();
