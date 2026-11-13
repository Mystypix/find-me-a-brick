// GET /api/set/:num returns a set's parts from Rebrickable.
// The API key stays on the server: it is read from the REBRICKABLE_API_KEY environment variable.
const API = 'https://rebrickable.com/api/v3/lego/sets/';

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

export default async (req, context) => {
  const key = process.env.REBRICKABLE_API_KEY;
  if (!key) return json(500, { error: 'no_key' });

  const num = context.params.num || '';
  if (!/^[A-Za-z0-9.]+-\d+$/.test(num)) return json(400, { error: 'bad_number' });

  const rb = async url => {
    const r = await fetch(url, { headers: { Authorization: 'key ' + key } });
    if (!r.ok) throw Object.assign(new Error('rebrickable ' + r.status), { status: r.status });
    return r.json();
  };

  try {
    const base = API + encodeURIComponent(num) + '/';
    const info = await rb(base);
    const parts = new Map();
    let url = base + 'parts/?page_size=1000&inc_minifig_parts=1';
    while (url) {
      const page = await rb(url);
      for (const it of page.results) {
        if (it.is_spare) continue;
        const k = it.part.part_num + '_' + it.color.id;
        const e = parts.get(k);
        if (e) e.qty += it.quantity;
        else parts.set(k, {
          key: k, partNum: it.part.part_num, name: it.part.name, img: it.part.part_img_url || '',
          colorId: it.color.id, colorName: it.color.name, rgb: it.color.rgb, qty: it.quantity,
          blIds: it.part.external_ids?.BrickLink || [],
        });
      }
      url = page.next;
    }
    return json(200, { num, name: info.name, img: info.set_img_url || '', parts: [...parts.values()] },
      { 'cache-control': 'public, max-age=3600' });
  } catch (e) {
    if (e.status === 404) return json(404, { error: 'not_found' });
    if (e.status === 401 || e.status === 403) return json(502, { error: 'bad_key' });
    if (e.status === 429) return json(429, { error: 'busy' });
    return json(502, { error: 'upstream' });
  }
};

export const config = { path: '/api/set/:num' };
