// Simple One-Click PIX widget. Posts to existing compatibility endpoint `/api/ghostspay-pix`.
(function () {
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs && typeof attrs === 'object') {
      Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k]));
    }
    (children || []).forEach(c => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  }

  const style = document.createElement('style');
  style.textContent = `
  #oneclick-pix-btn{position:fixed;right:18px;bottom:18px;background:#0b74de;color:#fff;border-radius:50px;padding:12px 18px;font-weight:700;z-index:9999;cursor:pointer}
  #oneclick-pix-modal{position:fixed;left:0;right:0;top:0;bottom:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10000}
  #oneclick-pix-panel{background:#fff;padding:18px;border-radius:8px;max-width:420px;width:100%}
  #oneclick-pix-panel input, #oneclick-pix-panel button{width:100%;box-sizing:border-box;margin-top:8px;padding:10px}
  #oneclick-pix-qr{max-width:100%;display:block;margin:10px auto}
  `;
  document.head.appendChild(style);

  const btn = el('button', { id: 'oneclick-pix-btn', type: 'button' }, [document.createTextNode('Pagar com PIX')]);
  document.body.appendChild(btn);

  const modal = el('div', { id: 'oneclick-pix-modal', style: 'display:none' }, []);
  const panel = el('div', { id: 'oneclick-pix-panel' }, []);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  panel.innerHTML = `
    <h3>Pagamento PIX</h3>
    <input id="oc_name" placeholder="Nome completo" />
    <input id="oc_email" placeholder="Email" />
    <input id="oc_document" placeholder="CPF (apenas números)" />
    <input id="oc_phone" placeholder="Telefone (apenas números)" />
    <input id="oc_amount" placeholder="Valor (em R$) - exemplo: 10.00" />
    <button id="oc_pay">Gerar PIX</button>
    <div id="oc_result" style="margin-top:8px"></div>
    <button id="oc_close" style="background:#eee;margin-top:8px">Fechar</button>
  `;

  btn.addEventListener('click', () => { modal.style.display = 'flex'; });
  panel.querySelector('#oc_close').addEventListener('click', () => { modal.style.display = 'none'; });

  async function postCreate(payload) {
    const res = await fetch('/api/ghostspay-pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  async function pollStatus(reference, onUpdate) {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const r = await fetch(`/api/check-pix?reference=${encodeURIComponent(reference)}`);
        const j = await r.json();
        if (j && j.success && j.data) {
          const d = j.data;
          // When list_transactions, API returns array
          const tx = Array.isArray(d) ? d[0] : d;
          const status = tx && (tx.status || tx.raw_status || (tx.customer_data && tx.customer_data.status)) || (tx && tx.data && tx.data.status) || null;
          onUpdate(status || (tx && tx.status) || JSON.stringify(tx));
          if (status === 'approved' || status === 'refunded' || status === 'failed' || attempts > 60) {
            clearInterval(interval);
          }
        }
      } catch (e) {
        // ignore
      }
    }, 3000);
  }

  panel.querySelector('#oc_pay').addEventListener('click', async () => {
    const name = panel.querySelector('#oc_name').value.trim();
    const email = panel.querySelector('#oc_email').value.trim();
    const documentVal = panel.querySelector('#oc_document').value.replace(/\D/g, '').trim();
    const phone = panel.querySelector('#oc_phone').value.replace(/\D/g, '').trim();
    const amountStr = panel.querySelector('#oc_amount').value.trim().replace(',', '.');
    const amount = Math.round((parseFloat(amountStr) || 0) * 100);

    const resultEl = panel.querySelector('#oc_result');
    resultEl.innerHTML = 'Gerando...';

    if (!name || !email || !amount || amount < 100) {
      resultEl.innerHTML = 'Preencha nome, email e valor mínimo R$1,00';
      return;
    }

    const reference = `OC-${Date.now()}`;
    const payload = {
      amount: amount,
      description: 'Compra One-Click',
      reference,
      customer: { name, email, document: documentVal, phone },
    };

    try {
      const data = await postCreate(payload);
      if (!data || !data.success) {
        resultEl.innerHTML = 'Erro: ' + (data && (data.error || (data.raw && data.raw.message)) || 'Resposta inválida');
        return;
      }

      const code = data.pix_code || data.raw && data.raw.pix_code;
      const qr = data.pix_qr_code_url || data.raw && data.raw.qr_code_base64 || '';
      const tx = data.transaction_hash || data.raw && data.raw.transaction_id || reference;

      resultEl.innerHTML = '';
      if (qr && qr.startsWith('data:image')) {
        const img = document.createElement('img'); img.id = 'oneclick-pix-qr'; img.src = qr; resultEl.appendChild(img);
      } else if (qr) {
        const img = document.createElement('img'); img.id = 'oneclick-pix-qr'; img.src = qr; resultEl.appendChild(img);
      }

      if (code) {
        const pre = document.createElement('pre'); pre.style.whiteSpace = 'pre-wrap'; pre.textContent = code; resultEl.appendChild(pre);
      }

      const statusEl = document.createElement('div'); statusEl.textContent = 'Aguardando pagamento...'; resultEl.appendChild(statusEl);

      // Start polling by reference if available
      pollStatus(reference, (s) => { statusEl.textContent = 'Status: ' + s; });
    } catch (err) {
      resultEl.innerHTML = 'Erro: ' + (err && err.message || String(err));
    }
  });

})();
