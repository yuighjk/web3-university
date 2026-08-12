// Shared response helpers
import type { Context } from 'hono';

export function ok<T>(c: Context, data: T, status: 200 | 201 = 200) {
  return c.json({ data }, status);
}

export function err(c: Context, message: string, status: 400 | 401 | 403 | 404 | 500 = 400) {
  return c.json({ error: message }, status);
}
