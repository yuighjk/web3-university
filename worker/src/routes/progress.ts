// Progress routes: GET /api/progress/:address/:courseId, POST /api/progress/:address/:courseId
import { Hono } from 'hono';
import { verifyActionSignature } from '../auth';
import { ok, err } from '../response';
import type { Env } from '../types';

export const progressRoutes = new Hono<{ Bindings: Env }>();

// GET /api/progress/:address/:courseId — public
progressRoutes.get('/:address/:courseId', async (c) => {
  const address = c.req.param('address').toLowerCase();
  const courseId = Number(c.req.param('courseId'));

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return err(c, 'Invalid address', 400);
  }
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return err(c, 'Invalid course id', 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT user_address, course_id, progress, completed_at
     FROM progress
     WHERE user_address = ? AND course_id = ?`
  )
    .bind(address, courseId)
    .first();

  if (!row) {
    return ok(c, { address, courseId, progress: 0, completedAt: null });
  }

  return ok(c, {
    address: row.user_address,
    courseId: row.course_id,
    progress: row.progress,
    completedAt: row.completed_at,
  });
});

// POST /api/progress/:address/:courseId — requires EIP-712 signature
progressRoutes.post('/:address/:courseId', async (c) => {
  const address = c.req.param('address').toLowerCase();
  const courseId = Number(c.req.param('courseId'));

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return err(c, 'Invalid address', 400);
  }
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return err(c, 'Invalid course id', 400);
  }

  let body: {
    progress: number;
    timestamp: number;
    signature: `0x${string}`;
  };

  try {
    body = await c.req.json();
  } catch {
    return err(c, 'Invalid JSON body', 400);
  }

  const { progress, timestamp, signature } = body;

  if (typeof progress !== 'number' || progress < 0 || progress > 100) {
    return err(c, 'progress must be an integer between 0 and 100', 400);
  }

  // Verify caller owns the address
  try {
    await verifyActionSignature({ action: 'updateProgress', address, timestamp, signature });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Signature verification failed';
    return err(c, msg, 401);
  }

  const completedAt = progress === 100 ? 'CURRENT_TIMESTAMP' : null;

  // Use a raw statement so we can conditionally set completed_at
  if (progress === 100) {
    await c.env.DB.prepare(
      `INSERT INTO progress (user_address, course_id, progress, completed_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_address, course_id) DO UPDATE SET
         progress = excluded.progress,
         completed_at = CASE WHEN progress.completed_at IS NULL THEN CURRENT_TIMESTAMP ELSE progress.completed_at END`
    )
      .bind(address, courseId, progress)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO progress (user_address, course_id, progress)
       VALUES (?, ?, ?)
       ON CONFLICT(user_address, course_id) DO UPDATE SET
         progress = excluded.progress`
    )
      .bind(address, courseId, progress)
      .run();
  }

  return ok(c, { address, courseId, progress, completedAt });
});
