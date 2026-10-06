export class APIError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new APIError(status, message); };
export const sha256 = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
export function text(value, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, 'Please check the form fields.');
  return value.trim();
}
export function requireOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !(env.ALLOWED_ORIGINS || '').split(',').includes(origin)) fail(403, 'Please open the Living Stones website to continue.');
}
export async function jsonBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail(415, 'Please send JSON.');
  if (Number(request.headers.get('Content-Length')) > 8192) fail(413, 'This message is too large.');
  const raw = await request.text();
  if (raw.length > 8192) fail(413, 'This message is too large.');
  let body; try { body = JSON.parse(raw); } catch { fail(400, 'Please check the form fields.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Please check the form fields.');
  return body;
}
export async function limit(request, env, namespace, maximum) {
  const now = Math.floor(Date.now()/1000);
  const bucket = await sha256(namespace + ':' + (request.headers.get('CF-Connecting-IP') || 'local') + ':' + Math.floor(now/600));
  const result = await env.DB.prepare('INSERT INTO rate_limits(bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket, now+1200).first();
  if (result.attempts > maximum) fail(429, 'Too many attempts. Please try again in a few minutes.');
  await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now).run();
}
