import { Hono } from 'hono';
import { encodePacked, keccak256 } from 'viem';
import { verifyActionSignature } from '../auth';
import { ok, err } from '../response';
import type { Env } from '../types';

export const courseRequestRoutes = new Hono<{ Bindings: Env }>();

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HTTP_URL_PATTERN = /^https?:\/\//i;

courseRequestRoutes.get('/', async (c) => {
  const wallet = c.req.query('wallet');
  const requestedStatus = c.req.query('status');

  if (wallet && !ADDRESS_PATTERN.test(wallet)) return err(c, 'Invalid wallet address', 400);
  if (requestedStatus && !['pending', 'approved', 'rejected'].includes(requestedStatus)) {
    return err(c, 'Invalid status', 400);
  }

  const conditions: string[] = [];
  const bindings: string[] = [];
  if (wallet) {
    conditions.push('provider_address = ?');
    bindings.push(wallet.toLowerCase());
  }
  if (requestedStatus) {
    conditions.push('status = ?');
    bindings.push(requestedStatus);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const statement = c.env.DB.prepare(
    `SELECT id, course_id, title, summary, description, category, certificate_name,
            video_url, cover_url, provider_address, status, rejection_reason,
            created_at, updated_at
     FROM course_requests
     ${where}
     ORDER BY created_at DESC
     LIMIT 100`,
  );
  const { results } = bindings.length > 0
    ? await statement.bind(...bindings).all()
    : await statement.all();

  return ok(c, results);
});

courseRequestRoutes.post('/', async (c) => {
  let body: {
    title: string;
    summary: string;
    description: string;
    category: string;
    certificateName: string;
    videoUrl: string;
    coverUrl: string;
    address: string;
    timestamp: number;
    signature: `0x${string}`;
  };

  try {
    body = await c.req.json();
  } catch {
    return err(c, 'Invalid JSON body', 400);
  }

  const fields = [body.title, body.summary, body.description, body.category,
    body.certificateName, body.videoUrl, body.coverUrl];
  if (fields.some((value) => typeof value !== 'string' || value.trim() === '')) {
    return err(c, 'Missing required fields', 400);
  }
  if (!ADDRESS_PATTERN.test(body.address ?? '') || !body.timestamp || !body.signature) {
    return err(c, 'Missing or invalid auth fields', 400);
  }
  if (!HTTP_URL_PATTERN.test(body.videoUrl) || !HTTP_URL_PATTERN.test(body.coverUrl)) {
    return err(c, 'Video and cover URLs must start with http:// or https://', 400);
  }
  if (body.title.length > 120 || body.summary.length > 180 || body.description.length > 2000) {
    return err(c, 'Course content is too long', 400);
  }

  try {
    await verifyActionSignature({
      action: 'submitCourse',
      address: body.address,
      timestamp: body.timestamp,
      signature: body.signature,
    });
  } catch (error) {
    return err(c, error instanceof Error ? error.message : 'Signature verification failed', 401);
  }

  const latest = await c.env.DB.prepare(
    `SELECT MAX(course_id) AS max_course_id FROM (
       SELECT course_id FROM courses
       UNION ALL
       SELECT course_id FROM course_requests
     )`,
  ).first<{ max_course_id: number | null }>();
  const courseId = (latest?.max_course_id ?? 0) + 1;
  const videoUrls = [body.videoUrl.trim()];
  const videoHash = keccak256(encodePacked(['string'], [videoUrls[0]]));
  const coverHash = keccak256(encodePacked(['string'], [body.coverUrl.trim()]));
  const contentHash = keccak256(encodePacked(
    ['string', 'string', 'string', 'string'],
    [body.title.trim(), body.description.trim(), videoHash, coverHash],
  ));

  const results = await c.env.DB.batch([
    c.env.DB.prepare(
    `INSERT INTO course_requests (
       course_id, title, summary, description, category, certificate_name,
       video_url, cover_url, provider_address
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      courseId, body.title.trim(), body.summary.trim(), body.description.trim(), body.category.trim(),
      body.certificateName.trim(), videoUrls[0], body.coverUrl.trim(), body.address.toLowerCase(),
    ),
    c.env.DB.prepare(
      `INSERT INTO courses (
         course_id, title, description, cover_url, video_urls,
         content_hash, status, provider_address
       ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).bind(
      courseId, body.title.trim(), body.description.trim(), body.coverUrl.trim(),
      JSON.stringify(videoUrls), contentHash, body.address.toLowerCase(),
    ),
  ]);
  const requestId = results[0].meta.last_row_id;

  return ok(c, { id: requestId, courseId, contentHash, status: 'pending' }, 201);
});
