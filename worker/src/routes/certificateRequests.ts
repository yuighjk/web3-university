// Certificate request routes: POST /api/certificate-requests, GET /api/certificate-requests
import { Hono } from 'hono';
import { ok, err } from '../response';
import type { Env } from '../types';

export const certificateRequestRoutes = new Hono<{ Bindings: Env }>();

// POST /api/certificate-requests — student requests a certificate after completing course
certificateRequestRoutes.post('/', async (c) => {
  let body: { courseId: number; address: string; timestamp: number; signature: string };
  try {
    body = await c.req.json();
  } catch {
    return err(c, 'Invalid JSON body', 400);
  }

  const { courseId, address, timestamp, signature } = body;
  if (!courseId || !address || !timestamp || !signature) {
    return err(c, 'Missing required fields', 400);
  }

  // Check if already requested
  const existing = await c.env.DB.prepare(
    `SELECT id FROM certificate_requests WHERE user_address = ? AND course_id = ?`
  ).bind(address.toLowerCase(), courseId).first();

  if (existing) {
    return err(c, '已提交过证书申请，请等待审批', 400);
  }

  // Check progress is 100%
  const progress = await c.env.DB.prepare(
    `SELECT progress FROM progress WHERE user_address = ? AND course_id = ?`
  ).bind(address.toLowerCase(), courseId).first<{ progress: number }>();

  if (!progress || progress.progress < 100) {
    return err(c, '课程尚未完成，无法申请证书', 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO certificate_requests (user_address, course_id, status, created_at) VALUES (?, ?, 'pending', datetime('now'))`
  ).bind(address.toLowerCase(), courseId).run();

  return ok(c, { message: '证书申请已提交' });
});

// GET /api/certificate-requests — list requests (optionally filtered by status or wallet)
certificateRequestRoutes.get('/', async (c) => {
  const status = c.req.query('status') || 'pending';
  const wallet = c.req.query('wallet');

  let sql = `SELECT cr.*, c.title as course_title FROM certificate_requests cr LEFT JOIN courses c ON cr.course_id = c.course_id`;
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (status) {
    conditions.push('cr.status = ?');
    bindings.push(status);
  }
  if (wallet) {
    conditions.push('cr.user_address = ?');
    bindings.push(wallet.toLowerCase());
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY cr.created_at DESC LIMIT 50';

  const stmt = c.env.DB.prepare(sql);
  const { results } = await (bindings.length > 0 ? stmt.bind(...bindings) : stmt).all();
  return ok(c, results);
});

// PATCH /api/certificate-requests/:id — Owner approves/rejects
certificateRequestRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  let body: { status: string };
  try {
    body = await c.req.json();
  } catch {
    return err(c, 'Invalid JSON body', 400);
  }

  if (!['approved', 'rejected'].includes(body.status)) {
    return err(c, 'Invalid status', 400);
  }

  await c.env.DB.prepare(
    `UPDATE certificate_requests SET status = ? WHERE id = ?`
  ).bind(body.status, id).run();

  return ok(c, { message: 'Updated' });
});
