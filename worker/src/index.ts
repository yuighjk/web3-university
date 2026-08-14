// Cloudflare Workers entry point — Hono app with all API routes
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { courseRoutes } from './routes/courses';
import { commentRoutes } from './routes/comments';
import { userRoutes } from './routes/users';
import { progressRoutes } from './routes/progress';
import { courseRequestRoutes } from './routes/courseRequests';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// CORS — allow all origins for frontend access; tighten in production
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);

// Health check
app.get('/', (c) => c.json({ status: 'ok' }));

// Mount routes
app.route('/api/courses', courseRoutes);

// Comments are nested under courses — pass :id param via base path
app.route('/api/courses/:id/comments', commentRoutes);

app.route('/api/users', userRoutes);
app.route('/api/progress', progressRoutes);
app.route('/api/course-requests', courseRequestRoutes);

// 404 fallback
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Global error handler — never expose internal details
app.onError((e, c) => {
  console.error('Unhandled error:', e);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
