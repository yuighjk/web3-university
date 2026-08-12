// Comment routes: GET /api/courses/:id/comments, POST /api/courses/:id/comments
import { Hono } from 'hono';
import type { Address } from 'viem';
import { verifyActionSignature } from '../auth';
import { checkHasPurchased } from '../chain';
import { ok, err } from '../response';
import type { Env } from '../types';

export const commentRoutes = new Hono<{ Bindings: Env }>();

// GET /api/courses/:id/comments — public
commentRoutes.get('/', async (c) => {
  const courseId = Number(c.req.param('id'));
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return err(c, 'Invalid course id', 400);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, course_id, user_address, content, created_at
     FROM comments
     WHERE course_id = ?
     ORDER BY created_at ASC`
  )
    .bind(courseId)
    .all();

  return ok(c, results);
});

// POST /api/courses/:id/comments — requires signature + on-chain purchase
commentRoutes.post('/', async (c) => {
  const courseId = Number(c.req.param('id'));
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return err(c, 'Invalid course id', 400);
  }

  let body: {
    content: string;
    address: string;
    timestamp: number;
    signature: `0x${string}`;
  };

  try {
    body = await c.req.json();
  } catch {
    return err(c, 'Invalid JSON body', 400);
  }

  const { content, address, timestamp, signature } = body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return err(c, 'Comment content is required', 400);
  }
  if (content.length > 2000) {
    return err(c, 'Comment too long (max 2000 chars)', 400);
  }

  // Verify EIP-712 signature
  try {
    await verifyActionSignature({ action: 'postComment', address, timestamp, signature });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Signature verification failed';
    return err(c, msg, 401);
  }

  // Verify on-chain purchase
  const rpcUrl = c.env.SEPOLIA_RPC_URL;
  const contractAddress = c.env.COURSE_MARKET_ADDRESS;
  if (!rpcUrl || !contractAddress) {
    return err(c, 'Server configuration error', 500);
  }

  const purchased = await checkHasPurchased(
    rpcUrl,
    contractAddress as Address,
    address as Address,
    courseId
  );

  if (!purchased) {
    return err(c, 'Must purchase course before commenting', 403);
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO comments (course_id, user_address, content) VALUES (?, ?, ?)`
  )
    .bind(courseId, address.toLowerCase(), content.trim())
    .run();

  return ok(
    c,
    {
      id: result.meta.last_row_id,
      courseId,
      userAddress: address.toLowerCase(),
      content: content.trim(),
    },
    201
  );
});
