// User routes: GET /api/users/:address, PUT /api/users/:address
import { Hono } from 'hono';
import { verifyActionSignature } from '../auth';
import { ok, err } from '../response';
import type { Env } from '../types';

export const userRoutes = new Hono<{ Bindings: Env }>();

// GET /api/users/:address — public
userRoutes.get('/:address', async (c) => {
  const address = c.req.param('address').toLowerCase();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return err(c, 'Invalid address', 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT address, username, avatar_url, updated_at FROM users WHERE address = ?`
  )
    .bind(address)
    .first();

  // Return empty profile if user hasn't set one yet
  if (!row) {
    return ok(c, { address, username: null, avatarUrl: null, updatedAt: null });
  }

  return ok(c, {
    address: row.address,
    username: row.username,
    avatarUrl: row.avatar_url,
    updatedAt: row.updated_at,
  });
});

// PUT /api/users/:address — requires EIP-712 signature
userRoutes.put('/:address', async (c) => {
  const address = c.req.param('address').toLowerCase();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return err(c, 'Invalid address', 400);
  }

  let body: {
    username?: string;
    avatarUrl?: string;
    timestamp: number;
    signature: `0x${string}`;
  };

  try {
    body = await c.req.json();
  } catch {
    return err(c, 'Invalid JSON body', 400);
  }

  const { username, avatarUrl, timestamp, signature } = body;

  // Verify the caller owns this address
  try {
    await verifyActionSignature({ action: 'updateProfile', address, timestamp, signature });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Signature verification failed';
    return err(c, msg, 401);
  }

  // Validate optional fields
  if (username !== undefined && (typeof username !== 'string' || username.length > 50)) {
    return err(c, 'Username must be a string up to 50 chars', 400);
  }
  if (avatarUrl !== undefined && typeof avatarUrl !== 'string') {
    return err(c, 'avatarUrl must be a string', 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO users (address, username, avatar_url, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(address) DO UPDATE SET
       username = excluded.username,
       avatar_url = excluded.avatar_url,
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind(address, username ?? null, avatarUrl ?? null)
    .run();

  return ok(c, { address, username: username ?? null, avatarUrl: avatarUrl ?? null });
});
