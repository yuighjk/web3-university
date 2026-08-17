// Provider application routes: POST + GET /api/provider-applications
import { Hono } from 'hono';
import { ok, err } from '../response';
import type { Env } from '../types';

export const providerApplicationRoutes = new Hono<{ Bindings: Env }>();

// POST /api/provider-applications — teacher/merchant submits application
providerApplicationRoutes.post('/', async (c) => {
  let body: { address: string; role: string; name: string; introduction: string; timestamp: number; signature: string };
  try {
    body = await c.req.json();
  } catch {
    return err(c, 'Invalid JSON body', 400);
  }

  const { address, role, name, introduction, timestamp, signature } = body;
  if (!address || !role || !name || !timestamp || !signature) {
    return err(c, 'Missing required fields', 400);
  }

  if (!['teacher', 'merchant'].includes(role)) {
    return err(c, 'Role must be teacher or merchant', 400);
  }

  // Check if already applied
  const existing = await c.env.DB.prepare(
    `SELECT id FROM provider_applications WHERE wallet_address = ? AND status = 'pending'`
  ).bind(address.toLowerCase()).first();

  if (existing) {
    return err(c, '已有待审批的申请，请等待', 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO provider_applications (wallet_address, role, name, introduction, status, created_at) VALUES (?, ?, ?, ?, 'pending', datetime('now'))`
  ).bind(address.toLowerCase(), role, name, introduction || '').run();

  return ok(c, { message: '身份申请已提交，等待 Owner 审批' });
});

// GET /api/provider-applications — list applications
providerApplicationRoutes.get('/', async (c) => {
  const status = c.req.query('status');
  const wallet = c.req.query('wallet');

  let sql = `SELECT * FROM provider_applications`;
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (status) {
    conditions.push('status = ?');
    bindings.push(status);
  }
  if (wallet) {
    conditions.push('wallet_address = ?');
    bindings.push(wallet.toLowerCase());
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC LIMIT 50';

  const stmt = c.env.DB.prepare(sql);
  const { results } = await (bindings.length > 0 ? stmt.bind(...bindings) : stmt).all();
  return ok(c, results);
});

// PATCH /api/provider-applications/:id — Owner approves/rejects
providerApplicationRoutes.patch('/:id', async (c) => {
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
    `UPDATE provider_applications SET status = ? WHERE id = ?`
  ).bind(body.status, id).run();

  return ok(c, { message: 'Updated' });
});
