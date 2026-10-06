// GET /api/portal/salir  -> cierra la sesión.
import { sessionCookie } from '../lib/portal.mjs';

export default async () => new Response(null, {
  status: 302,
  headers: { Location: '/clientes', 'Set-Cookie': sessionCookie('', 0), 'Cache-Control': 'no-store' },
});

export const config = { path: '/api/portal/salir' };
