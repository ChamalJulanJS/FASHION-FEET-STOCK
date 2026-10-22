import { getShoeDisplaySize, fmtMoney } from '../../lib/app.svelte';
import { restGet, restWrite } from '../../lib/api';
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
  locationId?: string;
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
  autoPcPrint?: boolean;
}

const POS_DRAFT_KEY = 'ff_mobile_pos_draft_v1';
const AUTO_PC_PRINT_KEY = 'ff_pos_auto_pc_print';

export function loadAutoPcPrint(): boolean {
  try {
    const v = localStorage.getItem(AUTO_PC_PRINT_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

export function saveAutoPcPrint(enabled: boolean) {
  try {
    localStorage.setItem(AUTO_PC_PRINT_KEY, String(enabled));
  } catch {}
}

/**
 * Send a receipt from Mobile POS to the branch's Counter PC POS thermal printer.
 * Prioritizes the dedicated `print_jobs` queue for zero data loss & sub-second latency,
 * with graceful fallback to `receipt_settings` if the table is pending migration.
 */
export async function sendReceiptToPcPrinter(
  r: PosReceiptDetails,
  explicitLocationId?: string,
): Promise<{ ok: boolean; message: string; jobId?: string; queueType: 'print_jobs' | 'legacy' }> {
  const locId = explicitLocationId || r.locationId;
  if (!locId) {
    return { ok: false, message: 'No branch location selected for PC printing.', queueType: 'legacy' };
  }

  const payload = {
    job_id: `${r.id}_${Date.now()}`,
    sale_id: r.id,
    invoice_no: r.invoiceNo,
    location_id: locId,
    branch_name: r.branchName,
    cashier_name: r.cashierName,
    customer_name: r.customer?.name || '',
    customer_phone: r.customerPhone || r.customer?.phone || '',
    payment_method: r.paymentMethod,
    subtotal: r.subtotal,
    discount: r.discount,
    total: r.grandTotal,
    cash_received: r.cashReceived,
    change_amount: r.changeAmount,
    date_str: r.date,
    queued_at: Date.now(),
    items: r.items.map((it) => ({
      sku: it.sku,
      name: it.brand ? `${it.brand} ${it.name}` : it.name,
      size: it.displaySize && it.displaySize !== '-' ? it.displaySize : it.size || '',
      colour: it.colour || '',
      quantity: it.qty,
      selling_price: it.unitPrice,
    })),
  };

  // 1. PRIMARY PIPELINE: Try fast dedicated `print_jobs` table
  try {
    const jobRes = await restWrite<any>('POST', 'print_jobs', {
      location_id: locId,
      sale_id: r.id || null,
      invoice_no: r.invoiceNo || null,
      payload,
      status: 'pending',
      attempts: 0,
    });

    const createdJob = Array.isArray(jobRes) ? jobRes[0] : jobRes;
    const jobId = createdJob?.id || payload.job_id;

    return {
      ok: true,
      jobId,
      queueType: 'print_jobs',
      message: `Sent ${formatInvoiceNo(r.invoiceNo, r.id)} to ${r.branchName} Counter PC Printer!`,
    };
  } catch (tableErr: any) {
    console.warn('Dedicated print_jobs queue not available, falling back to legacy queue:', tableErr?.message || tableErr);
  }

  // 2. FALLBACK PIPELINE: Legacy `receipt_settings` queue
  try {
    const existingRows = await restGet<any[]>(
      `receipt_settings?location_id=eq.${encodeURIComponent(locId)}&select=location_id,email_address`,
    );
    const now = Date.now();
    let queue: any[] = [];

    if (existingRows && existingRows.length > 0) {
      const rawField = existingRows[0].email_address;
      if (rawField && typeof rawField === 'string' && rawField.startsWith('{')) {
        try {
          const parsed = JSON.parse(rawField);
          if (Array.isArray(parsed.ff_print_queue)) {
            queue = parsed.ff_print_queue.filter(
              (j: any) => j && typeof j.queued_at === 'number' && now - j.queued_at < 2 * 3600 * 1000,
            );
          }
        } catch {}
      }
      queue.push(payload);
      if (queue.length > 10) queue = queue.slice(-10);

      await restWrite('PATCH', `receipt_settings?location_id=eq.${encodeURIComponent(locId)}`, {
        email_address: JSON.stringify({ ff_print_queue: queue }),
      });
    } else {
      queue.push(payload);
      await restWrite('POST', 'receipt_settings', {
        location_id: locId,
        business_name: r.branchName || 'Fashion Feet',
        paper_size: '58mm',
        font_size: 'small',
        email_address: JSON.stringify({ ff_print_queue: queue }),
      });
    }

    return {
      ok: true,
      jobId: payload.job_id,
      queueType: 'legacy',
      message: `Sent ${formatInvoiceNo(r.invoiceNo, r.id)} to ${r.branchName} Counter PC (legacy)!`,
    };
  } catch (err: any) {
    console.error('Failed to queue PC print job:', err);
    return {
      ok: false,
      queueType: 'legacy',
      message: 'Failed to send to PC Printer: ' + (err.message || 'Network error'),
    };
  }
}

/**
 * Polls for the confirmation of a print job until it's printed, failed, or times out.
 */
export async function waitForPrintJobStatus(
  jobId: string,
  timeoutMs = 12000,
): Promise<{ status: 'printed' | 'failed' | 'timeout' | 'pending'; error?: string }> {
  if (!jobId) return { status: 'timeout' };
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const rows = await restGet<any[]>(
        `print_jobs?id=eq.${encodeURIComponent(jobId)}&select=status,error,printed_at`,
      );
      if (rows && rows.length > 0) {
        const s = rows[0].status;
        if (s === 'printed') return { status: 'printed' };
        if (s === 'failed') return { status: 'failed', error: rows[0].error };
      }
    } catch {}
    await new Promise((res) => setTimeout(res, 800));
  }
  return { status: 'timeout' };
}

/**
 * Checks if the Counter PC for this branch is currently online (heartbeat within 35s).
 */
export async function checkCounterPcStatus(
  locationId: string,
): Promise<{ online: boolean; terminalName?: string; printerName?: string }> {
  if (!locationId) return { online: false };
  try {
    const threshold = new Date(Date.now() - 35000).toISOString();
    const rows = await restGet<any[]>(
      `pc_terminals?location_id=eq.${encodeURIComponent(locationId)}&is_online=eq.true&last_seen_at=gte.${encodeURIComponent(threshold)}&order=last_seen_at.desc&limit=1`,
    );
    if (rows && rows.length > 0) {
      return {
        online: true,
        terminalName: rows[0].terminal_name,
        printerName: rows[0].printer_name,
      };
    }
  } catch {}
  return { online: false };
}

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
