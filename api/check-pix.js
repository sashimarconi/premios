const { URL } = require('url');
const fetch = global.fetch || require('node-fetch');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// Query Paradise for transaction status by id or external reference
// Env: PARADISE_API_KEY, PARADISE_API_URL (e.g. https://multi.paradisepags.com)
module.exports = async (req, res) => {
  try {
    const apiKey = process.env.PARADISE_API_KEY;
    const baseUrl = (process.env.PARADISE_API_URL || process.env.PARADISE_BASE_URL || '').replace(/\/$/, '');

    if (!apiKey || !baseUrl) {
      return json(res, 500, { success: false, error: 'Paradise credentials (PARADISE_API_KEY and PARADISE_API_URL) are not configured' });
    }

    const q = req.method === 'GET' ? req.query || {} : (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});
    const id = q.id || q.transaction_id;
    const external = q.reference || q.external_id || q.externalId;

    if (!id && !external) {
      return json(res, 400, { success: false, error: 'Provide id or reference (external_id) as query parameter' });
    }

    let url;
    if (id) {
      url = `${baseUrl}/api/v1/query.php?action=get_transaction&id=${encodeURIComponent(String(id))}`;
    } else {
      url = `${baseUrl}/api/v1/query.php?action=list_transactions&external_id=${encodeURIComponent(String(external))}`;
    }

    const g = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json',
      },
    });

    const txt = await g.text();
    let data;
    try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }

    if (!g.ok) {
      return json(res, g.status, { success: false, error: data.error || data.message || 'Paradise query failed', details: data });
    }

    return json(res, 200, { success: true, data });
  } catch (err) {
    return json(res, 500, { success: false, error: err && err.message ? err.message : 'Internal error' });
  }
};
