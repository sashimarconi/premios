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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { success: false, error: "Method not allowed" });
  }

  const secretKey = process.env.GHOSTSPAY_SECRET_KEY;
  const companyId = process.env.GHOSTSPAY_COMPANY_ID;

  if (!secretKey || !companyId) {
    return json(res, 500, {
      success: false,
      error: "GhostsPay credentials are not configured",
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

    const credentials = Buffer.from(`${secretKey}:${companyId}`).toString("base64");

    const payload = {
      customer,
      paymentMethod: "PIX",
      items,
      amount,
      installments: 1,
      postbackUrl: process.env.GHOSTSPAY_POSTBACK_URL || undefined,
      metadata: {
        source: "mlpremio-vercel",
      },
    };

    const gatewayResponse = await fetch("https://api.ghostspaysv2.com/functions/v1/transactions", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
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
        error: data.error || data.message || "GhostsPay request failed",
        details: data,
      });
    }

    const tx = data.data || data.transaction || data;
    const pix = tx.pix || data.pix || {};

    const pixCode =
      pix.code ||
      pix.copyPaste ||
      pix.copy_paste ||
      pix.emv ||
      tx.pixCode ||
      data.pix_code ||
      "";

    const qrUrl =
      pix.qrcode ||
      pix.qrCode ||
      pix.qr_code_url ||
      tx.pixQrCodeUrl ||
      data.pix_qr_code_url ||
      "";

    const transactionHash = tx.id || tx.transactionHash || tx.transaction_hash || data.id || "";

    return json(res, 200, {
      success: true,
      pix_code: pixCode,
      pix_qr_code_url: qrUrl,
      transaction_hash: transactionHash,
      gateway: "ghostspay",
      raw: data,
    });
  } catch (error) {
    return json(res, 500, {
      success: false,
      error: error && error.message ? error.message : "Internal error",
    });
  }
};
