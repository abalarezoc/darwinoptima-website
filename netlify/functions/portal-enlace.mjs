// POST /api/portal/enlace  { email }  -> envía el enlace mágico si el correo es de un cliente activo.
import { findActiveClientByEmail, loginToken, sendLoginEmail, siteUrl, json } from '../lib/portal.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405);
  let email = '';
  try { email = String((await req.json()).email || '').trim().toLowerCase(); } catch (_) {}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return json({ ok: false, error: 'correo' }, 400);
  try {
    const c = await findActiveClientByEmail(email);
    if (c) {
      const link = siteUrl(req) + '/api/portal/entrar?t=' + encodeURIComponent(loginToken(c));
      await sendLoginEmail(c.email, c.nombre, link);
    }
  } catch (e) {
    console.error('portal-enlace', e.message);
    return json({ ok: false, error: 'servidor' }, 500);
  }
  // Misma respuesta exista o no el correo: no revela quién es cliente.
  return json({ ok: true });
};

export const config = { path: '/api/portal/enlace' };
