// GET /api/portal/entrar?t=...  -> valida el enlace, abre sesión y lleva al panel.
import { verify, findActiveClientByEmail, sessionToken, sessionCookie, SESSION_MAX_AGE } from '../lib/portal.mjs';

export default async (req) => {
  const t = new URL(req.url).searchParams.get('t');
  const p = verify(t, 'login');
  let ok = false;
  if (p) {
    try { const c = await findActiveClientByEmail(p.em); ok = !!(c && c.id === p.cid); }
    catch (e) { console.error('portal-entrar', e.message); }
  }
  if (!ok) return new Response(null, { status: 302, headers: { Location: '/clientes?e=enlace', 'Cache-Control': 'no-store' } });
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/clientes/panel',
      'Set-Cookie': sessionCookie(sessionToken(p.cid, p.em), SESSION_MAX_AGE),
      'Cache-Control': 'no-store',
    },
  });
};

export const config = { path: '/api/portal/entrar' };
