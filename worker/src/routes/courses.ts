// Course routes: GET /api/courses, GET /api/courses/:id, GET /api/courses/:id/videos,
// POST /api/courses, PATCH /api/courses/:id/status
import { Hono } from 'hono';
import { keccak256, encodePacked, type Address } from 'viem';
import { verifyActionSignature } from '../auth';
import { checkHasPurchased } from '../chain';
import { ok, err } from '../response';
import type { Env } from '../types';

export const courseRoutes = new Hono<{ Bindings: Env }>();

// GET /api/courses — public list (no video_urls)
courseRoutes.get('/', async (c) => {
  const requestedStatus = c.req.query('status');
  const status = requestedStatus && ['pending', 'published', 'delisted'].includes(requestedStatus)
    ? requestedStatus
    : 'published';
  const { results } = await c.env.DB.prepare(
    `SELECT id, course_id, title, description, cover_url, content_hash, status, provider_address, created_at
     FROM courses
     WHERE status = ?
     ORDER BY created_at DESC
     LIMIT 50`
  ).bind(status).all();
  return ok(c, results);
});

// GET /api/courses/:id — public detail (no video_urls)
courseRoutes.get('/:id', async (c) => {
  const courseId = Number(c.req.param('id'));
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return err(c, 'Invalid course id', 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT id, course_id, title, description, cover_url, content_hash, status, provider_address, created_at
     FROM courses WHERE course_id = ?`
  )
    .bind(courseId)
    .first();

  if (!row) return err(c, 'Course not found', 404);
  return ok(c, row);
});

// GET /api/courses/:id/videos — requires on-chain purchase
courseRoutes.get('/:id/videos', async (c) => {
  const courseId = Number(c.req.param('id'));
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return err(c, 'Invalid course id', 400);
  }

  // Caller must supply their address as query param for chain verification
  const userAddress = c.req.query('address');
  if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return err(c, 'Missing or invalid address query param', 400);
  }

  const rpcUrl = c.env.SEPOLIA_RPC_URL;
  const contractAddress = c.env.COURSE_MARKET_ADDRESS;
  if (!rpcUrl || !contractAddress) {
    return err(c, 'Server configuration error', 500);
  }

  const purchased = await checkHasPurchased(
    rpcUrl,
    contractAddress as Address,
    userAddress as Address,
    courseId
  );

  if (!purchased) {
    return err(c, 'Not purchased', 403);
  }

  const row = await c.env.DB.prepare(
    `SELECT video_urls FROM courses WHERE course_id = ? AND status = 'published'`
  )
    .bind(courseId)
    .first<{ video_urls: string }>();

  if (!row) return err(c, 'Course not found', 404);

  let videoUrls: string[];
  try {
    videoUrls = JSON.parse(row.video_urls);
  } catch {
    return err(c, 'Malformed video data', 500);
  }

  return ok(c, { videoUrls });
});

// POST /api/courses — submit draft (EIP-712 signature required)
courseRoutes.post('/', async (c) => {
  let body: {
    courseId: number;
    title: string;
    description: string;
    coverUrl: string;
    videoUrls: string[];
    address: string;
    timestamp: number;
    signature: `0x${string}`;
  };

  try {
    body = await c.req.json();
  } catch {
    return err(c, 'Invalid JSON body', 400);
  }

  const { courseId, title, description, coverUrl, videoUrls, address, timestamp, signature } = body;

  // Basic input validation
  if (!courseId || !title || !description || !coverUrl || !Array.isArray(videoUrls) || videoUrls.length === 0) {
    return err(c, 'Missing required fields', 400);
  }
  if (!address || !timestamp || !signature) {
    return err(c, 'Missing auth fields', 400);
  }

  try {
    await verifyActionSignature({ action: 'submitCourse', address, timestamp, signature });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Signature verification failed';
    return err(c, msg, 401);
  }

  // Compute content hash matching the contract's expected value
  const videoHashes = videoUrls.map((url) =>
    keccak256(encodePacked(['string'], [url]))
  );
  const contentHash = keccak256(
    encodePacked(
      ['string', 'string', 'string', 'string'],
      [title, description, videoHashes.join(','), keccak256(encodePacked(['string'], [coverUrl]))]
    )
  );

  try {
    await c.env.DB.prepare(
      `INSERT INTO courses (course_id, title, description, cover_url, video_urls, content_hash, status, provider_address)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
      .bind(courseId, title, description, coverUrl, JSON.stringify(videoUrls), contentHash, address.toLowerCase())
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'DB error';
    if (msg.includes('UNIQUE')) return err(c, 'Course ID already exists', 400);
    return err(c, 'Database error', 500);
  }

  return ok(c, { courseId, contentHash }, 201);
});

// PATCH /api/courses/:id/status — owner-only status update (EIP-712 signature required)
courseRoutes.patch('/:id/status', async (c) => {
  const courseId = Number(c.req.param('id'));
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return err(c, 'Invalid course id', 400);
  }

  let body: {
    status: string;
    address: string;
    timestamp: number;
    signature: `0x${string}`;
  };

  try {
    body = await c.req.json();
  } catch {
    return err(c, 'Invalid JSON body', 400);
  }

  const { status, address, timestamp, signature } = body;
  if (!address || !timestamp || !signature) return err(c, 'Missing auth fields', 400);
  const VALID_STATUSES = ['pending', 'published', 'delisted'];
  if (!VALID_STATUSES.includes(status)) {
    return err(c, `Invalid status. Allowed: ${VALID_STATUSES.join(', ')}`, 400);
  }

  try {
    await verifyActionSignature({ action: 'updateCourseStatus', address, timestamp, signature });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Signature verification failed';
    return err(c, msg, 401);
  }

  const result = await c.env.DB.prepare(
    `UPDATE courses SET status = ? WHERE course_id = ?`
  )
    .bind(status, courseId)
    .run();

  if (result.meta.changes === 0) return err(c, 'Course not found', 404);
  return ok(c, { courseId, status });
});
