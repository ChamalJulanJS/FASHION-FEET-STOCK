import { getShoeDisplaySize, fmtMoney } from '../../lib/app.svelte';
import type { Variant } from '../../lib/types';

export type PaymentMethod = 'cash' | 'card' | 'split' | 'qr';

export interface PosLine {
  variant: Variant;
  qty: number;
  unitPrice: number;
  itemDiscount: number;
  availableStock: number;
}

export interface PosCustomer {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  total_spend?: number;
}

export interface PosReceiptItem {
  sku: string;
  name: string;
  brand: string;
  size: string;
  displaySize: string;
  colour: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PosReceiptDetails {
  id: string;
  invoiceNo: string | number;
  date: string;
  branchName: string;
  cashierName: string;
  customer?: PosCustomer | null;
  customerPhone?: string;
  paymentMethod: PaymentMethod | string;
  subtotal: number;
  discount: number;
  grandTotal: number;
  cashReceived: number;
  changeAmount: number;
  items: PosReceiptItem[];
}

export interface PosDraft {
  locationId: string;
  lines: PosLine[];
  discountVal: string;
  discountMode: 'fixed' | 'pct';
  paymentMethod: PaymentMethod;
  cashReceived: string;
  customer: PosCustomer | null;
  whatsappPhone: string;
}

const POS_DRAFT_KEY = 'ff_mobile_pos_draft_v1';

export function loadPosDraft(): PosDraft | null {
  try {
    const raw = localStorage.getItem(POS_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.lines)) return parsed as PosDraft;
  } catch (e) {
    console.warn('Failed to load POS draft', e);
  }
  return null;
}

export function savePosDraft(draft: PosDraft) {
  try {
    localStorage.setItem(POS_DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {
    console.warn('Failed to save POS draft', e);
  }
}

export function clearPosDraft() {
  try {
    localStorage.removeItem(POS_DRAFT_KEY);
  } catch {}
}

/** Normalize Sri Lankan phone number to international format (947XXXXXXXX) for wa.me links */
export function normalizeSlPhone(raw?: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0') && digits.length === 10) {
    return '94' + digits.slice(1);
  }
  if (digits.length === 9 && digits.startsWith('7')) {
    return '94' + digits;
  }
  if (digits.startsWith('94') && digits.length === 11) {
    return digits;
  }
  return digits;
}

export function formatInvoiceNo(invoiceNo?: string | number | null, id?: string): string {
  if (invoiceNo !== undefined && invoiceNo !== null && String(invoiceNo).trim() !== '') {
    return `INV-${invoiceNo}`;
  }
  return id ? `INV-${id.slice(-6).toUpperCase()}` : 'INV-NEW';
}

export function buildWhatsAppReceiptText(r: PosReceiptDetails): string {
  const inv = formatInvoiceNo(r.invoiceNo, r.id);
  const lines: string[] = [];
  lines.push(`*FASHION FEET — OFFICIAL RECEIPT*`);
  lines.push(`Branch: *${r.branchName}*`);
  lines.push(`Invoice: *${inv}*`);
  lines.push(`Date: ${r.date}`);
  if (r.customer?.name) {
    lines.push(`Customer: ${r.customer.name}`);
  }
  lines.push(`--------------------------------`);
  r.items.forEach((it, idx) => {
    const sz = it.displaySize && it.displaySize !== '-' ? ` (Sz ${it.displaySize})` : '';
    lines.push(`${idx + 1}. *${it.brand ? it.brand + ' ' : ''}${it.name}*${sz}`);
    lines.push(`   ${it.sku}  |  ${it.qty} x ${fmtMoney(it.unitPrice)} = *${fmtMoney(it.lineTotal)}*`);
  });
  lines.push(`--------------------------------`);
  lines.push(`Subtotal: ${fmtMoney(r.subtotal)}`);
  if (r.discount > 0) {
    lines.push(`Discount: - ${fmtMoney(r.discount)}`);
  }
  lines.push(`*GRAND TOTAL: ${fmtMoney(r.grandTotal)}*`);
  lines.push(`Payment: ${String(r.paymentMethod).toUpperCase()}`);
  if (r.cashReceived > 0) {
    lines.push(`Cash Received: ${fmtMoney(r.cashReceived)}`);
    lines.push(`Change Given: *${fmtMoney(r.changeAmount)}*`);
  }
  lines.push(`--------------------------------`);
  lines.push(`Thank you for shopping at *Fashion Feet*!`);
  return lines.join('\n');
}

export function openWhatsAppReceipt(r: PosReceiptDetails, phoneInput?: string) {
  const text = buildWhatsAppReceiptText(r);
  const encoded = encodeURIComponent(text);
  const targetPhone = normalizeSlPhone(phoneInput || r.customerPhone || r.customer?.phone);
  const url = targetPhone
    ? `https://wa.me/${targetPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank');
}

const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export function printPosThermalReceipt(r: PosReceiptDetails, paperWidth: '80mm' | '58mm' = '80mm'): boolean {
  const w = window.open('', '_blank', 'width=420,height=740');
  if (!w) return false;
  const inv = formatInvoiceNo(r.invoiceNo, r.id);
  const bodyWidth = paperWidth === '80mm' ? '74mm' : '52mm';
  const rows = r.items
    .map(
      (it, i) => `
      <tr>
        <td style="padding:4px 2px;">
          <div style="font-weight:700;">${i + 1}. ${esc(it.brand ? it.brand + ' ' : '')}${esc(it.name)}</div>
          <div style="font-size:10px;color:#333;">SKU: ${esc(it.sku)} | Sz: <b>${esc(it.displaySize)}</b>${it.colour ? ` | ${esc(it.colour)}` : ''}</div>
        </td>
        <td style="text-align:center;padding:4px 2px;vertical-align:top;">${it.qty}</td>
        <td style="text-align:right;padding:4px 2px;vertical-align:top;">${it.unitPrice.toFixed(2)}</td>
        <td style="text-align:right;padding:4px 2px;font-weight:700;vertical-align:top;">${it.lineTotal.toFixed(2)}</td>
      </tr>`,
    )
    .join('');

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(inv)}</title>
<style>
  @page { size: ${paperWidth} auto; margin: 2mm; }
  body { font-family: 'Courier New', monospace; width: ${bodyWidth}; margin: 0 auto; font-size: 11px; color: #000; line-height: 1.35; }
  h1 { font-size: 17px; text-align: center; margin: 0; letter-spacing: 1.5px; font-weight: 900; }
  .c { text-align: center; } .r { text-align: right; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { border-bottom: 1px solid #000; padding: 3px 2px; font-size: 10px; text-transform: uppercase; }
  .tot-row { display: flex; justify-content: space-between; margin: 2px 0; }
  .grand { font-size: 14px; font-weight: 900; border-top: 2px double #000; border-bottom: 1px dashed #000; padding: 4px 0; margin: 4px 0; }
</style></head><body>
  <h1>FASHION FEET</h1>
  <div class="c" style="font-size:11px;font-weight:700;">${esc(r.branchName)}</div>
  <div class="c" style="font-size:9px;">FOOTWEAR &amp; ACCESSORIES</div>
  <hr>
  <div class="tot-row"><span>Invoice:</span><b>${esc(inv)}</b></div>
  <div class="tot-row"><span>Date:</span><span>${esc(r.date)}</span></div>
  <div class="tot-row"><span>Cashier:</span><span>${esc(r.cashierName)}</span></div>
  ${r.customer?.name ? `<div class="tot-row"><span>Customer:</span><span>${esc(r.customer.name)}</span></div>` : ''}
  <hr>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;">Item</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Price</th>
        <th style="text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <hr>
  <div class="tot-row"><span>Subtotal:</span><span>Rs. ${r.subtotal.toFixed(2)}</span></div>
  ${r.discount > 0 ? `<div class="tot-row"><span>Discount:</span><span>- Rs. ${r.discount.toFixed(2)}</span></div>` : ''}
  <div class="tot-row grand"><span>GRAND TOTAL:</span><span>Rs. ${r.grandTotal.toFixed(2)}</span></div>
  <div class="tot-row"><span>Payment Method:</span><b>${esc(String(r.paymentMethod).toUpperCase())}</b></div>
  ${
    r.cashReceived > 0
      ? `<div class="tot-row"><span>Cash Received:</span><span>Rs. ${r.cashReceived.toFixed(2)}</span></div>
         <div class="tot-row" style="font-weight:700;font-size:12px;"><span>CHANGE:</span><span>Rs. ${r.changeAmount.toFixed(2)}</span></div>`
      : ''
  }
  <hr>
  <div class="c" style="font-size:10px;margin-top:6px;">
    Exchange within 7 days with original bill &amp; unworn condition.<br>
    <b>Thank you for shopping at Fashion Feet!</b>
  </div>
  <script>window.onload=function(){window.focus();window.print();}<\/script>
</body></html>`);
  w.document.close();
  return true;
}
