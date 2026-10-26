/** Version 1 is pinned to the outbox record. Keep it deterministic for retries. */
const origin = 'https://onyxchat.site';
const products: Record<string, { name: string; amount: string }> = {
  plus: { name: 'ONYX Plus', amount: '3.99' },
  boost: { name: 'Server Boost', amount: '2.99' },
  super: { name: 'Super Boost', amount: '5.99' },
  mega: { name: 'Mega Boost', amount: '8.99' },
  top: { name: 'Top Row', amount: '12.99' },
};
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (value: number) => String(value).padStart(2, '0');
function dateLabel(value: string) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00(?::00)?$/.test(value)) throw Error('invalid_purchase_mail');
  const date = new Date(value.replace(' ', 'T').replace(/\+00$/, '+00:00'));
  if (!Number.isFinite(date.getTime())) throw Error('invalid_purchase_mail');
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()} · ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}
function base64(value: string) {
  let bytes = '';
  for (const byte of new TextEncoder().encode(value)) bytes += String.fromCharCode(byte);
  return btoa(bytes);
}

/** Only the immutable receipt stored by the database is used; no current policy lookup. */
export async function purchaseMailV1(subject: string, text: string) {
  if (subject !== 'ONYX — Purchase confirmation' || typeof text !== 'string' || text.length > 90000) throw Error('invalid_purchase_mail');
  const match = /^ONYX — Purchase confirmation\nOrder: ([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\nProduct: (plus|boost|super|mega|top)\nTotal: EUR (\d+\.\d{2})\n(Monthly subscription; cancel before renewal\.|One-time payment; 14 days from activation; no renewal\.)\nPaid: ([^\n]+)\nTerms SHA-256: ([a-f0-9]{64})\nTerms accepted in Stripe Checkout\.\n\n([\s\S]+)$/.exec(text);
  if (!match) throw Error('invalid_purchase_mail');
  const [, order, sku, amount, period, paidAt, hash, terms] = match;
  const product = products[sku], monthly = sku === 'plus';
  if (amount !== product.amount || period.startsWith('Monthly') !== monthly || terms.length < 100 || terms.length > 80000) throw Error('invalid_purchase_mail');
  const actualHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(terms))), byte => byte.toString(16).padStart(2, '0')).join('');
  if (actualHash !== hash) throw Error('purchase_terms_mismatch');
  const paid = dateLabel(paidAt), cadence = monthly ? 'Monthly subscription' : 'One-time payment';
  const detail = monthly ? 'Renews monthly until cancelled.' : '14 days from activation. No automatic renewal.';
  const links = `${monthly ? `<a href="${origin}/guidelines/#cancel-subscription" style="color:#bdcbd4;text-decoration:underline;">Cancel subscription</a><span style="color:#52616b;padding:0 8px;">·</span>` : ''}<a href="${origin}/guidelines/#withdraw-contract" style="color:#bdcbd4;text-decoration:underline;">Right of withdrawal</a>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>ONYX — Purchase confirmation</title><style>body{margin:0!important;padding:0!important}table{border-collapse:separate;border-spacing:0}a{color:inherit}@media(max-width:480px){.outer{padding:24px 12px!important}.content{padding:28px 24px!important}.heading{font-size:26px!important}.reference{font-size:11px!important}}</style></head>
<body style="margin:0;padding:0;background:#07090b;color:#f4f8fa;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;color:#07090b;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(product.name)} · €${amount} · Payment confirmed.</div>
<table role="presentation" width="100%" bgcolor="#07090b" style="background:#07090b;"><tr><td class="outer" align="center" style="padding:48px 20px;">
<!--[if mso]><table role="presentation" width="560"><tr><td><![endif]-->
<table role="presentation" width="100%" style="width:100%;max-width:560px;">
<tr><td style="padding:0 0 22px 2px;"><table role="presentation"><tr><td><img src="${origin}/brand/onyx-logo-512.png" width="30" height="30" alt="" style="display:block;border:0;border-radius:9px;"></td><td style="padding-left:10px;color:#f4f8fa;font-size:18px;font-weight:750;letter-spacing:1px;">ONYX</td></tr></table></td></tr>
<tr><td class="content" bgcolor="#11171b" style="padding:38px 36px 34px;background:#11171b;border:1px solid #263137;border-radius:16px;">
<h1 class="heading" style="margin:0 0 30px;color:#f4f8fa;font-size:30px;font-weight:700;line-height:1.22;letter-spacing:-.8px;">Payment confirmed.</h1>
<table role="presentation" width="100%" style="width:100%;"><tr><td style="padding:0 12px 10px 0;color:#f4f8fa;font-size:18px;font-weight:650;line-height:26px;">${escape(product.name)}</td><td align="right" style="padding-bottom:10px;white-space:nowrap;color:#f4f8fa;font-size:24px;font-weight:700;line-height:28px;">€${amount}</td></tr>
<tr><td colspan="2" style="padding:0 0 24px;color:#bdcbd4;font-size:13px;line-height:21px;">${cadence}<br>${detail}</td></tr>
<tr><td colspan="2" style="border-top:1px solid #263137;padding-top:22px;">
<p style="margin:0 0 5px;color:#9aadb8;font-size:12px;line-height:18px;">Paid on</p><p style="margin:0 0 17px;color:#e2eaf0;font-size:13px;line-height:21px;">${paid}</p>
<p style="margin:0 0 5px;color:#9aadb8;font-size:12px;line-height:18px;">Order reference</p><p class="reference" style="margin:0;color:#e2eaf0;font-size:12px;line-height:20px;overflow-wrap:anywhere;word-break:break-all;">${order}</p>
</td></tr></table>
<table role="presentation" style="margin-top:28px;"><tr><td bgcolor="#10b981" style="border-radius:8px;background:#10b981;text-align:center;mso-padding-alt:13px 22px;"><a href="${origin}/app/" style="display:inline-block;padding:13px 22px;color:#03130c;font-size:14px;font-weight:700;line-height:20px;text-decoration:none;">Open ONYX</a></td></tr></table>
<p style="margin:24px 0 0;color:#9aadb8;font-size:12px;line-height:20px;">Your purchase terms and withdrawal information are attached.<br>Keep this email for your records.</p>
</td></tr><tr><td style="padding:22px 4px 0;color:#9aadb8;font-size:12px;line-height:22px;">${links}</td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { html, attachments: [{ filename: 'ONYX-purchase-terms.txt', content: base64(terms) }] };
}
