function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function normalizeItems(cart) {
  if (!Array.isArray(cart) || cart.length === 0) {
    return [];
  }

  return cart.map((item, idx) => ({
    title: String(item.title || `Item ${idx + 1}`).slice(0, 100),
    unitPrice: Math.max(1, Number(item.price) || 0),
    quantity: Math.max(1, Number(item.quantity) || 1),
    externalRef: String(item.product_hash || item.externalRef || `item-${idx + 1}`).slice(0, 50),
  }));
}

function normalizeCustomer(customer) {
  const source = customer && typeof customer === "object" ? customer : {};
  const name = String(source.name || source.nome || "Cliente PIX").trim();
  const email = String(source.email || "cliente@example.com").trim();
  const phone = String(source.phone || source.telefone || "").replace(/\D/g, "");
  const document = String(source.document || source.cpf || "").replace(/\D/g, "");

  const out = { name, email };
  if (phone) out.phone = phone;
  if (document) out.document = document;
  return out;
}

// Paradise PIX endpoint adapter
// Env vars used:
// - PARADISE_API_KEY (required)
// - PARADISE_API_URL (required)
// - PARADISE_MERCHANT_ID (optional)
// - PARADISE_API_ENDPOINT (optional, default "/v1/payments")
// - PARADISE_POSTBACK_URL (optional)

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { success: false, error: "Method not allowed" });
  }

  const apiKey = process.env.PARADISE_API_KEY;
  const merchantId = process.env.PARADISE_MERCHANT_ID;
  const baseUrl = process.env.PARADISE_API_URL || process.env.PARADISE_BASE_URL;

  if (!apiKey || !baseUrl) {
    return json(res, 500, {
      success: false,
      error: "Paradise credentials (PARADISE_API_KEY and PARADISE_API_URL) are not configured",
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const amount = Math.max(100, Number(body.amount) || 0);
    const items = normalizeItems(body.cart);
    const customer = normalizeCustomer(body.customer);

    if (!items.length) {
      return json(res, 400, { success: false, error: "Cart items are required" });
    }

    const payload = {
      merchant_id: merchantId,
      amount: amount,
      currency: "BRL",
      payment_method: "PIX",
      customer,
      items,
      metadata: Object.assign({ source: "mlpremio-vercel" }, body.metadata || {}),
      postback_url: process.env.PARADISE_POSTBACK_URL,
    };

    const endpoint = (process.env.PARADISE_API_ENDPOINT || "/v1/payments").replace(/^\/+/, "");
    const url = `${baseUrl.replace(/\/$/, "")}/${endpoint}`;

    const gatewayResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const raw = await gatewayResponse.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!gatewayResponse.ok) {
      return json(res, gatewayResponse.status, {
        success: false,
        error: data.error || data.message || "Paradise request failed",
        details: data,
      });
    }

    const tx = data.data || data.transaction || data || {};
    const pix = tx.pix || tx.payment || tx || {};

    const qrcodeValue = pix.qrcode || pix.qr_code || pix.qrCode || pix.qr || "";

    const pixCode =
      pix.code ||
      pix.copyPaste ||
      pix.copy_paste ||
      pix.emv ||
      qrcodeValue ||
      tx.pixCode ||
      data.pix_code ||
      data.copy_paste ||
      "";

    const qrUrl =
      pix.receiptUrl ||
      pix.qrCodeUrl ||
      pix.qrCode ||
      pix.qr_code_url ||
      pix.qr_url ||
      tx.pixQrCodeUrl ||
      data.pix_qr_code_url ||
      "";

    const transactionHash = tx.id || tx.transactionHash || tx.transaction_hash || data.id || data.transaction_id || "";

    return json(res, 200, {
      success: true,
      pix_code: pixCode,
      pix_qr_code_url: qrUrl || qrcodeValue,
      transaction_hash: transactionHash,
      gateway: "paradise",
      raw: data,
    });
  } catch (error) {
    return json(res, 500, {
      success: false,
      error: error && error.message ? error.message : "Internal error",
    });
  }
};
