// GET /api/portal/datos  -> datos del cliente con sesión activa.
import { verify, readCookie, COOKIE, getClientData, json, sessionCookie } from '../lib/portal.mjs';

export default async (req) => {
  const s = verify(readCookie(req, COOKIE), 'session');
  if (!s) return json({ ok: false }, 401);
  try {
    const data = await getClientData(s.cid, s.em);
    if (!data) return json({ ok: false }, 401, { 'Set-Cookie': sessionCookie('', 0) });
    return json({ ok: true, data });
  } catch (e) {
    console.error('portal-datos', e.message);
    return json({ ok: false, error: 'servidor' }, 500);
  }
};

export const config = { path: '/api/portal/datos' };
