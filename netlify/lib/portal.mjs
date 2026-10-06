// Portal de clientes de Darwin Optima — utilidades compartidas.
// Capa intermedia: hoy lee de Notion. Para migrar a Supabase, solo se reemplaza este archivo.
import crypto from 'node:crypto';

export const DB = {
  clientes: '58d52997ac2d49c5a210913c97e1d30c',
  pendientes: '4a86ea63ee7444898d5aaf423d79a6dc',
  documentos: '4bd8f75d1fd04e83b1ac60dea7f21b4c',
  facturas: 'b788d2df27194318852d8fc2ccc841e0',
};

// Enlaces por defecto de cada solución (se pueden reemplazar por cliente en Notion).
export const TOOL_URLS = {
  'CapitalOptima': 'https://capo.darwinoptima.com',
  'Tarifa Justa': 'https://tarifajusta.darwinoptima.com',
  'Quadrant': 'https://quadrant.darwinoptima.com',
  'ACS': 'https://acs.darwinoptima.com',
  'PCM': 'https://pcm.darwinoptima.com',
};

export const COOKIE = 'do_portal';
const LOGIN_MINUTES = 20;
const SESSION_DAYS = 7;

export function env(k) {
  try { if (globalThis.Netlify && Netlify.env) { const v = Netlify.env.get(k); if (v) return v; } } catch (_) {}
  return process.env[k];
}

export function siteUrl(req) {
  return env('URL') || new URL(req.url).origin;
}

/* ---------- Notion ---------- */
async function notion(path, body) {
  const r = await fetch('https://api.notion.com/v1' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + env('NOTION_TOKEN'),
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error('Notion ' + r.status + ': ' + (await r.text()).slice(0, 300));
  return r.json();
}

async function queryAll(db, filter, sorts) {
  let out = [], cursor;
  do {
    const body = { page_size: 100 };
    if (filter) body.filter = filter;
    if (sorts) body.sorts = sorts;
    if (cursor) body.start_cursor = cursor;
    const j = await notion('/databases/' + db + '/query', body);
    out = out.concat(j.results);
    cursor = j.has_more ? j.next_cursor : null;
  } while (cursor);
  return out;
}

const txt = (p) => !p ? '' : ((p.type === 'title' ? p.title : p.rich_text) || []).map((t) => t.plain_text).join('').trim();
const num = (p) => (p && typeof p.number === 'number') ? p.number : null;
const sel = (p) => (p && p.select) ? p.select.name : '';
const multi = (p) => (p && p.multi_select) ? p.multi_select.map((o) => o.name) : [];
const date = (p) => (p && p.date) ? p.date.start : null;
const url = (p) => (p && p.url) ? p.url : '';
const email = (p) => (p && p.email) ? p.email.trim().toLowerCase() : '';
const check = (p) => !!(p && p.checkbox);
const file = (p) => {
  const f = p && p.files && p.files[0];
  if (!f) return '';
  return f.type === 'file' ? f.file.url : (f.external ? f.external.url : '');
};

export async function findActiveClientByEmail(mail) {
  const m = String(mail || '').trim().toLowerCase();
  if (!m) return null;
  const rows = await queryAll(DB.clientes, { property: 'Acceso', select: { equals: 'Activo' } });
  const row = rows.find((r) => email(r.properties['Correo']) === m);
  return row ? { id: row.id, email: m, nombre: txt(row.properties['Cliente']) } : null;
}

export async function getClientData(clientId, mail) {
  const page = await notion('/pages/' + clientId);
  const p = page.properties;
  if (page.archived || sel(p['Acceso']) !== 'Activo' || email(p['Correo']) !== mail) return null;

  const rel = { property: 'Cliente', relation: { contains: clientId } };
  const [pend, docs, facs] = await Promise.all([
    queryAll(DB.pendientes, rel, [{ property: 'Vence', direction: 'ascending' }]),
    queryAll(DB.documentos, rel, [{ property: 'Fecha', direction: 'descending' }]),
    queryAll(DB.facturas, rel, [{ property: 'Vence', direction: 'descending' }]),
  ]);

  const indicadores = [1, 2, 3]
    .map((i) => ({ valor: txt(p['Indicador ' + i + ' valor']), etiqueta: txt(p['Indicador ' + i + ' etiqueta']) }))
    .filter((x) => x.valor);

  const herramientas = multi(p['Herramientas']).map((n) => ({
    nombre: n,
    enlace: url(p['Enlace ' + n]) || TOOL_URLS[n] || '',
  }));

  return {
    cliente: { nombre: txt(p['Cliente']), empresa: txt(p['Empresa']), rubro: txt(p['Rubro']) },
    proyecto: {
      etapa: sel(p['Etapa']),
      avance: num(p['Avance de etapa %']),
      semana: num(p['Semana actual']),
      semanas: num(p['Semanas totales']),
      diagnostico: date(p['Diagnóstico completado']),
      plan: date(p['Plan aprobado']),
      traspaso: date(p['Traspaso previsto']),
    },
    sesion: { fecha: date(p['Próxima sesión']), tema: txt(p['Tema de la sesión']) },
    mensaje: txt(p['Mensaje del consultor']),
    indicadores,
    herramientas,
    pendientes: pend.map((r) => ({
      titulo: txt(r.properties['Pendiente']),
      responsable: txt(r.properties['Responsable']),
      vence: date(r.properties['Vence']),
      hecho: check(r.properties['Hecho']),
      completado: date(r.properties['Completado el']),
      etiqueta: sel(r.properties['Etiqueta']),
    })).filter((x) => x.titulo),
    documentos: docs.map((r) => ({
      nombre: txt(r.properties['Documento']),
      fecha: date(r.properties['Fecha']),
      enlace: url(r.properties['Enlace']) || file(r.properties['Archivo']),
    })).filter((x) => x.nombre),
    facturas: facs.map((r) => ({
      numero: txt(r.properties['Factura']),
      periodo: txt(r.properties['Periodo']),
      monto: num(r.properties['Monto']),
      estado: sel(r.properties['Estado']),
      vence: date(r.properties['Vence']),
      enlace: url(r.properties['Enlace']) || file(r.properties['Archivo']),
    })).filter((x) => x.numero),
    actualizado: page.last_edited_time,
  };
}

/* ---------- Tokens firmados ---------- */
function hmac(data) {
  const secret = env('PORTAL_SECRET');
  if (!secret || secret.length < 32) throw new Error('PORTAL_SECRET falta o es muy corto');
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + hmac(body);
}

export function verify(token, purpose) {
  try {
    if (!token || token.indexOf('.') < 0) return null;
    const [body, sig] = token.split('.');
    const exp = hmac(body);
    if (!sig || sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (p.p !== purpose || !p.exp || Date.now() > p.exp) return null;
    return p;
  } catch (_) { return null; }
}

export const loginToken = (c) => sign({ p: 'login', cid: c.id, em: c.email, exp: Date.now() + LOGIN_MINUTES * 60e3 });
export const sessionToken = (cid, em) => sign({ p: 'session', cid, em, exp: Date.now() + SESSION_DAYS * 864e5 });

export function readCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export function sessionCookie(token, maxAge) {
  return COOKIE + '=' + encodeURIComponent(token) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge;
}
export const SESSION_MAX_AGE = SESSION_DAYS * 86400;

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

/* ---------- Correo (Resend) ---------- */
export async function sendLoginEmail(to, nombre, link) {
  const from = env('MAIL_FROM') || 'Darwin Optima <portal@darwinoptima.com>';
  const saludo = nombre ? 'Hola, ' + nombre.split(' ')[0] + ':' : 'Hola:';
  const html = `<!doctype html><html><body style="margin:0;background:#F4F4F1;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1F2529">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F1;padding:40px 16px"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #E3E7E8">
<tr><td style="background:#1F2529;padding:24px 32px;color:#F4F4F1;font-weight:600;font-size:16px">Darwin Optima</td></tr>
<tr><td style="padding:36px 32px 12px;font-size:15px;line-height:1.6">
<p style="margin:0 0 16px">${saludo}</p>
<p style="margin:0 0 28px">Este es tu enlace para entrar a tu portal de cliente. Es personal y vence en ${LOGIN_MINUTES} minutos.</p>
<p style="margin:0 0 28px"><a href="${link}" style="display:inline-block;background:#9CD1CC;color:#1F2529;text-decoration:none;font-weight:600;padding:14px 26px">Entrar a mi portal →</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#5B6670">Si no pediste este acceso, ignora este correo. Nadie puede entrar sin abrir este enlace.</p>
</td></tr>
<tr><td style="padding:20px 32px 28px;font-size:12px;color:#8A939A;border-top:1px solid #EDEFF1">Darwin Optima · Orden. Precisión. Ventaja.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${saludo}\n\nEste es tu enlace para entrar a tu portal de cliente (vence en ${LOGIN_MINUTES} minutos):\n${link}\n\nSi no pediste este acceso, ignora este correo.\n\nDarwin Optima`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env('RESEND_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: 'Tu acceso al portal de Darwin Optima', html, text }),
  });
  if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 300));
}
