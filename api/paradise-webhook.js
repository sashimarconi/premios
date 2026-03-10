const fs = require('fs');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// Simple webhook endpoint for Paradise postbacks.
// Configure PARADISE_WEBHOOK_KEY to require a matching X-API-Key header (optional).
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { success: false, error: 'Method not allowed' });
  }

  try {
    const expected = process.env.PARADISE_WEBHOOK_KEY;
    const received = req.headers['x-api-key'] || req.headers['x-api-key'.toLowerCase()];
    if (expected && expected !== received) {
      return json(res, 401, { success: false, error: 'Invalid webhook key' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

    // Append to hts-log.txt for record (best-effort; Vercel filesystem is ephemeral)
    try {
      const line = `[${new Date().toISOString()}] ${JSON.stringify(body)}\n`;
      fs.appendFileSync('hts-log.txt', line);
    } catch (e) {
      // ignore write errors
    }

    // respond 200 to acknowledge receipt
    return json(res, 200, { success: true });
  } catch (err) {
    return json(res, 500, { success: false, error: err && err.message ? err.message : 'Internal error' });
  }
};
