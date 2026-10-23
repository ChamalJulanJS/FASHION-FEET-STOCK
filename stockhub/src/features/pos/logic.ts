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
  n8nStatus?: {
    attempted: boolean;
    ok: boolean;
    message?: string;
    timestamp?: number;
  };
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
  autoN8nSend?: boolean;
}

const POS_DRAFT_KEY = 'ff_mobile_pos_draft_v1';
const AUTO_PC_PRINT_KEY = 'ff_pos_auto_pc_print';
export const N8N_WEBHOOK_URL_KEY = 'ff_n8n_webhook_url';
export const N8N_AUTO_SEND_KEY = 'ff_n8n_auto_send';

export function loadN8nWebhookUrl(): string {
  try {
    return localStorage.getItem(N8N_WEBHOOK_URL_KEY) || '';
  } catch {
    return '';
  }
}

export function saveN8nWebhookUrl(url: string) {
  try {
    localStorage.setItem(N8N_WEBHOOK_URL_KEY, url.trim());
  } catch {}
}

export function loadN8nAutoSend(): boolean {
  try {
    const v = localStorage.getItem(N8N_AUTO_SEND_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

export function saveN8nAutoSend(enabled: boolean) {
  try {
    localStorage.setItem(N8N_AUTO_SEND_KEY, String(enabled));
  } catch {}
}

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

export function formatPhoneDisplay(normalized: string): string {
  if (!normalized) return '';
  if (normalized.startsWith('94') && normalized.length === 11) {
    return '0' + normalized.slice(2, 5) + ' ' + normalized.slice(5);
  }
  return normalized;
}

export function getReceiptOnlineUrl(saleId?: string): string {
  if (!saleId) return '';
  try {
    if (typeof window !== 'undefined' && window.location) {
      const origin = window.location.origin;
      const pathname = window.location.pathname;
      const basePath = pathname.replace(/\/[^/]*$/, '');
      const cleanBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
      return `${origin}${cleanBase}/receipt.html?id=${encodeURIComponent(saleId)}`;
    }
  } catch {}
  return `https://chamaljulanjs.github.io/FASHION-FEET-STOCK/receipt.html?id=${encodeURIComponent(saleId)}`;
}

export function buildWhatsAppReceiptText(r: PosReceiptDetails, receiptUrl?: string): string {
  const inv = formatInvoiceNo(r.invoiceNo, r.id);
  const totalPairs = r.items.reduce((s, i) => s + i.qty, 0);
  const lines: string[] = [];
  lines.push(`✨ *FASHION FEET — OFFICIAL RECEIPT* ✨`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`📍 *Branch:* ${r.branchName}`);
  lines.push(`🧾 *Invoice:* *${inv}*`);
  lines.push(`📅 *Date:* ${r.date}`);
  if (r.customer?.name) {
    lines.push(`👤 *Customer:* ${r.customer.name}`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`🛍️ *PURCHASED ITEMS (${totalPairs} pair${totalPairs === 1 ? '' : 's'}):*`);
  lines.push(``);
  r.items.forEach((it, idx) => {
    const num = idx + 1;
    const sz = it.displaySize && it.displaySize !== '-' ? ` • Sz: *${it.displaySize}*` : (it.size ? ` • Sz: *${it.size}*` : '');
    const col = it.colour ? ` | ${it.colour}` : '';
    lines.push(`${num}. *${it.brand ? it.brand + ' ' : ''}${it.name}*`);
    lines.push(`   ${it.sku}${sz}${col}`);
    lines.push(`   ${it.qty} × Rs. ${fmtMoney(it.unitPrice)} = *Rs. ${fmtMoney(it.lineTotal)}*`);
    lines.push(``);
  });
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`💵 *Subtotal:* Rs. ${fmtMoney(r.subtotal)}`);
  if (r.discount > 0) {
    lines.push(`🏷️ *Discount:* - Rs. ${fmtMoney(r.discount)}`);
  }
  lines.push(`💳 *GRAND TOTAL: Rs. ${fmtMoney(r.grandTotal)}*`);
  lines.push(`🪙 *Payment Method:* ${String(r.paymentMethod).toUpperCase()}`);
  if (r.cashReceived > 0) {
    lines.push(`💵 *Cash Received:* Rs. ${fmtMoney(r.cashReceived)}`);
    lines.push(`🪙 *Change Given:* *Rs. ${fmtMoney(r.changeAmount)}*`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
  const finalUrl = receiptUrl || getReceiptOnlineUrl(r.id);
  if (finalUrl) {
    lines.push(`🔗 *View Online E-Bill & Warranty:*`);
    lines.push(finalUrl);
    lines.push(``);
  }
  lines.push(`⚠️ *Exchange Policy:*`);
  lines.push(`Exchange within 7 days with this digital invoice & unworn condition.`);
  lines.push(``);
  lines.push(`❤️ *Thank you for shopping at Fashion Feet!*`);
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

/**
 * Generates an ultra-detailed, premium, high-resolution JPEG receipt slip image as a Base64 string.
 * Renders on a 2x Retina canvas with Fashion Feet official branding, full shoe metadata
 * (UK/EU size, colour, SKU, item breakdown), financial totals, exchange warranty, and online verification.
 */
export function generateReceiptImageBase64(r: PosReceiptDetails): string {
  if (typeof document === 'undefined') return '';
  try {
    const scale = 2; // Retina 2x sharpness
    const width = 600;
    const headerHeight = 240;
    const itemsHeight = Math.max(r.items.length * 68, 90);
    const totalsHeight = (r.discount > 0 ? 26 : 0) + (r.cashReceived > 0 ? 56 : 0) + 160;
    const footerHeight = 150;
    const height = headerHeight + itemsHeight + totalsHeight + footerHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.scale(scale, scale);

    // Background - Crisp White Slip
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Top Emerald Brand Strip
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, 0, width, 5);

    // Outer subtle receipt border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, width - 24, height - 24);

    let y = 46;

    // Header - Brand Name
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 25px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FASHION FEET', width / 2, y);

    y += 22;
    ctx.font = '800 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#059669'; // Emerald
    ctx.fillText(String(r.branchName || 'SHOE GALLERY').toUpperCase(), width / 2, y);

    y += 18;
    ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('PREMIUM FOOTWEAR & ACCESSORIES · OFFICIAL E-RECEIPT', width / 2, y);

    y += 16;
    function drawDashed(currY: number) {
      ctx!.save();
      ctx!.beginPath();
      ctx!.setLineDash([5, 3]);
      ctx!.strokeStyle = '#cbd5e1';
      ctx!.lineWidth = 1;
      ctx!.moveTo(25, currY);
      ctx!.lineTo(width - 25, currY);
      ctx!.stroke();
      ctx!.restore();
    }

    drawDashed(y);
    y += 24;

    // Invoice Meta Grid
    const inv = formatInvoiceNo(r.invoiceNo, r.id);
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.fillText(`Invoice No: ${inv}`, 25, y);
    ctx.textAlign = 'right';
    ctx.fillText(`Date: ${r.date}`, width - 25, y);

    y += 18;
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'left';
    ctx.fillText(`Cashier: ${r.cashierName || 'Staff Cashier'}`, 25, y);
    if (r.customer?.name) {
      ctx.textAlign = 'right';
      ctx.fillText(`Customer: ${r.customer.name}`, width - 25, y);
    }

    if (r.customerPhone) {
      y += 16;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748b';
      ctx.font = '600 10.5px monospace';
      ctx.fillText(`Tel: ${r.customerPhone}`, width - 25, y);
    }

    y += 16;
    drawDashed(y);
    y += 22;

    // Table Header
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(25, y - 14, width - 50, 24);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(25, y - 14, width - 50, 24);

    ctx.font = 'bold 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'left';
    ctx.fillText('ITEM / DESCRIPTION', 32, y + 2);
    ctx.textAlign = 'center';
    ctx.fillText('QTY', width - 150, y + 2);
    ctx.textAlign = 'right';
    ctx.fillText('TOTAL (LKR)', width - 32, y + 2);

    y += 22;

    // Items
    r.items.forEach((it, idx) => {
      const num = `${idx + 1}. `;
      const itemName = `${it.brand ? it.brand + ' ' : ''}${it.name}`;
      const fullName = num + itemName;
      const truncated = fullName.length > 34 ? fullName.slice(0, 32) + '...' : fullName;

      ctx.font = 'bold 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.fillText(truncated, 25, y);

      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(it.qty), width - 150, y);

      ctx.textAlign = 'right';
      ctx.fillText(it.lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 }), width - 25, y);

      y += 16;
      ctx.font = '600 10.5px monospace';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'left';
      const sz = it.displaySize && it.displaySize !== '-' ? `Sz: ${it.displaySize}` : (it.size ? `Sz: ${it.size}` : '');
      const details = [it.sku, sz, it.colour].filter(Boolean).join(' | ');
      ctx.fillText(details, 38, y);

      ctx.textAlign = 'right';
      ctx.fillText(`@ Rs. ${it.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, width - 25, y);

      y += 26;
    });

    drawDashed(y);
    y += 22;

    // Financial Breakdown
    const totalPairs = r.items.reduce((s, i) => s + i.qty, 0);
    ctx.font = '600 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'left';
    ctx.fillText(`Subtotal (${totalPairs} Pair${totalPairs === 1 ? '' : 's'})`, 25, y);
    ctx.textAlign = 'right';
    ctx.fillText(`Rs. ${r.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, width - 25, y);
    y += 20;

    if (r.discount > 0) {
      ctx.fillStyle = '#d97706';
      ctx.textAlign = 'left';
      ctx.fillText('Special Discount (වට්ටම)', 25, y);
      ctx.textAlign = 'right';
      ctx.fillText(`- Rs. ${r.discount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, width - 25, y);
      y += 20;
    }

    // Grand Total Highlight Box
    y += 4;
    ctx.fillStyle = '#0f172a'; // Luxury Dark Navy
    ctx.fillRect(25, y, width - 50, 44);

    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('GRAND TOTAL (මුළු මුදල)', 40, y + 27);

    ctx.font = '900 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#34d399'; // Bright emerald
    ctx.textAlign = 'right';
    ctx.fillText(`Rs. ${r.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, width - 40, y + 28);
    y += 62;

    // Settlement Info
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'left';
    ctx.fillText(`Payment Method: ${String(r.paymentMethod).toUpperCase()}`, 25, y);

    if (r.cashReceived > 0) {
      ctx.textAlign = 'right';
      ctx.fillText(`Cash: Rs. ${r.cashReceived.toLocaleString()} | Change: Rs. ${r.changeAmount.toLocaleString()}`, width - 25, y);
    }
    y += 22;

    drawDashed(y);
    y += 24;

    // Warranty & Policy Details
    ctx.font = 'bold 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.fillText('7-DAY EXCHANGE GUARANTEE', width / 2, y);

    y += 16;
    ctx.font = '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Exchanges accepted within 7 days at any Fashion Feet branch', width / 2, y);
    y += 14;
    ctx.fillText('Item must be unworn with original tags & this verified receipt.', width / 2, y);

    y += 20;
    ctx.font = 'bold 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('Thank You for Shopping at Fashion Feet!', width / 2, y);

    // Export as high-quality JPEG and strip data:image/... prefix for WAHA / WhatsApp
    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
    return dataUrl.replace(/^data:image\/[a-z]+;base64,/, '').trim();
  } catch (e) {
    console.warn('Canvas receipt generation failed:', e);
    return '';
  }
}
  } catch (e) {
    console.warn('Canvas receipt generation failed:', e);
    return '';
  }
}

export interface N8nPosBillPayload {
  event: 'pos_sale_completed';
  timestamp: number;
  sale_id: string;
  invoice_no: string;
  display_invoice: string;
  date_str: string;
  branch_name: string;
  location_id?: string | null;
  cashier_name: string;
  customer_name: string;
  customer_phone: string;
  customer_phone_formatted: string;
  payment_method: string;
  subtotal: number;
  discount: number;
  total: number;
  cash_received: number;
  change_amount: number;
  total_pairs: number;
  items: Array<{
    sku: string;
    name: string;
    brand: string;
    size: string;
    display_size: string;
    colour: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
  receipt_url: string;
  whatsapp_message: string;
}

/**
 * Dispatches the receipt payload to the user's n8n Webhook running on their VPS.
 * Uses dual-mode dispatch (application/json with text/plain fallback) to bypass any CORS preflight friction.
 */
export async function sendBillToN8nWebhook(
  r: PosReceiptDetails,
  phoneInput?: string,
  explicitWebhookUrl?: string,
): Promise<{ ok: boolean; message: string; status?: number }> {
  const webhookUrl = (explicitWebhookUrl || loadN8nWebhookUrl()).trim();
  if (!webhookUrl) {
    return {
      ok: false,
      message: 'n8n Webhook URL is not configured. Please enter your VPS Webhook URL in Settings.',
    };
  }

  const targetPhone = normalizeSlPhone(phoneInput || r.customerPhone || r.customer?.phone);
  if (!targetPhone) {
    return { ok: false, message: 'Customer phone number is required to send WhatsApp bill.' };
  }

  const receiptUrl = getReceiptOnlineUrl(r.id);
  const messageText = buildWhatsAppReceiptText(r, receiptUrl);
  const inv = formatInvoiceNo(r.invoiceNo, r.id);

  const payload: N8nPosBillPayload = {
    event: 'pos_sale_completed',
    timestamp: Date.now(),
    sale_id: r.id,
    invoice_no: String(r.invoiceNo || ''),
    display_invoice: inv,
    date_str: r.date,
    branch_name: r.branchName,
    location_id: r.locationId || null,
    cashier_name: r.cashierName,
    customer_name: r.customer?.name || 'Valued Customer',
    customer_phone: targetPhone,
    customer_phone_formatted: formatPhoneDisplay(targetPhone),
    chat_id: `${targetPhone}@c.us`,
    chatId: `${targetPhone}@c.us`,
    payment_method: String(r.paymentMethod).toUpperCase(),
    subtotal: r.subtotal,
    discount: r.discount,
    total: r.grandTotal,
    cash_received: r.cashReceived,
    change_amount: r.changeAmount,
    total_pairs: r.items.reduce((s, i) => s + i.qty, 0),
    items: r.items.map((it) => ({
      sku: it.sku,
      name: it.name,
      brand: it.brand || '',
      size: it.size || '',
      display_size: it.displaySize || '',
      colour: it.colour || '',
      quantity: it.qty,
      unit_price: it.unitPrice,
      line_total: it.lineTotal,
    })),
    receipt_url: receiptUrl,
    whatsapp_message: messageText,
    formattedMessage: messageText,
    text: messageText,
    receipt_image_base64: generateReceiptImageBase64(r),
  };

  try {
    // 1. Try standard JSON post
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        message: `WhatsApp bill queued via VPS n8n to ${payload.customer_phone_formatted}!`,
      };
    } else {
      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        status: res.status,
        message: `n8n Webhook returned HTTP ${res.status}${errText ? ': ' + errText.slice(0, 100) : ''}`,
      };
    }
  } catch (err: any) {
    // 2. Fallback: simple text/plain post (bypasses browser CORS preflight check)
    try {
      const retryRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify(payload),
      });
      if (retryRes.ok) {
        return {
          ok: true,
          status: retryRes.status,
          message: `WhatsApp bill queued via VPS n8n to ${payload.customer_phone_formatted}!`,
        };
      }
    } catch {}

    console.error('Failed to trigger n8n webhook:', err);
    return {
      ok: false,
      message: `Could not reach n8n VPS (${err?.message || 'Network error'}). Please verify VPS is online or use direct WhatsApp.`,
    };
  }
}

/** Test ping to verify n8n Webhook connectivity */
export async function testN8nWebhook(webhookUrl: string): Promise<{ ok: boolean; message: string; status?: number }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { ok: false, message: 'Invalid Webhook URL. It must begin with http:// or https://' };
  }

  const testPayload = {
    event: 'pos_test_ping',
    timestamp: Date.now(),
    sale_id: 'test_sale_001',
    invoice_no: '9999',
    display_invoice: 'INV-9999',
    date_str: new Date().toLocaleString('en-GB'),
    branch_name: 'Fashion Feet (Test)',
    cashier_name: 'Test Cashier',
    customer_name: 'Test Customer',
    customer_phone: '94771234567',
    customer_phone_formatted: '077 123 4567',
    chat_id: '94771234567@c.us',
    chatId: '94771234567@c.us',
    payment_method: 'CASH',
    subtotal: 3500,
    discount: 500,
    total: 3000,
    cash_received: 3000,
    change_amount: 0,
    total_pairs: 1,
    items: [
      {
        sku: 'TEST-01',
        name: 'Classic Footwear Test',
        brand: 'Fashion Feet',
        size: '42',
        display_size: '42 (UK 8)',
        colour: 'Black',
        quantity: 1,
        unit_price: 3500,
        line_total: 3500,
      },
    ],
    receipt_url: 'https://chamaljulanjs.github.io/FASHION-FEET-STOCK/receipt.html',
    whatsapp_message: '✨ *FASHION FEET POS TEST* ✨\nYour VPS n8n Webhook is working perfectly!',
    formattedMessage: '✨ *FASHION FEET POS TEST* ✨\nYour VPS n8n Webhook is working perfectly!',
    text: '✨ *FASHION FEET POS TEST* ✨\nYour VPS n8n Webhook is working perfectly!',
    receipt_image_base64: generateReceiptImageBase64({
      id: 'test-01',
      invoiceNo: 9999,
      date: new Date().toLocaleString('en-GB'),
      branchName: 'Shoe Gallery (Test)',
      cashierName: 'Cashier',
      customer: { id: 'c1', name: 'Valued Customer', phone: '0771234567' },
      paymentMethod: 'cash',
      subtotal: 3500,
      discount: 500,
      grandTotal: 3000,
      cashReceived: 3000,
      changeAmount: 0,
      items: [
        {
          sku: 'SG-101',
          name: 'Classic Men Sneaker',
          brand: 'Puma',
          size: '42',
          displaySize: '42 (UK 8)',
          colour: 'Black',
          qty: 1,
          unitPrice: 3500,
          lineTotal: 3500,
        },
      ],
    }),
    test: true,
  };

  try {
    const res = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload),
    });
    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        message: `Connected! VPS n8n received test ping (HTTP ${res.status}).`,
      };
    } else {
      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        status: res.status,
        message: `VPS responded with HTTP ${res.status}${errText ? ': ' + errText.slice(0, 80) : ''}`,
      };
    }
  } catch (err: any) {
    // Try simple request fallback
    try {
      const retry = await fetch(webhookUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(testPayload),
      });
      if (retry.ok) {
        return {
          ok: true,
          status: retry.status,
          message: `Connected! VPS n8n responded (HTTP ${retry.status}).`,
        };
      }
    } catch {}

    return {
      ok: false,
      message: `Connection failed: ${err?.message || 'Network error'}. Check VPS URL or SSL certificate.`,
    };
  }
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
