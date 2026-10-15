import { getShoeDisplaySize } from './app.svelte';
import type { Variant } from './types';

export interface VoucherItem {
  variant: Partial<Variant>;
  qty: number;
}

export interface VoucherDetails {
  id: string;
  fromName: string;
  toName: string;
  status: string;
  driverNotes: string;
  dispatchedByName: string;
  date: string;
  items: VoucherItem[];
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const voucherNumber = (d: VoucherDetails) => `#${d.id.slice(0, 10).toUpperCase()}`;
export const voucherType = (d: VoucherDetails) =>
  d.status === 'received' ? 'Direct Stock Sync (Received)' : 'Dispatched (In-Transit)';
export const voucherPairs = (d: VoucherDetails) => d.items.reduce((s, i) => s + i.qty, 0);

/** Open a print window with an 80mm thermal receipt layout. Returns false if popup blocked. */
export function printVoucher(d: VoucherDetails): boolean {
  const w = window.open('', '_blank', 'width=420,height=720');
  if (!w) return false;
  const rows = d.items
    .map((it, i) => {
      const v = it.variant;
      return `<tr><td>${i + 1}</td><td><b>${esc(v.products?.brand ? v.products.brand + ' ' : '')}${esc(v.products?.name || v.sku)}</b><br><small>${esc(v.sku)} | Colour: ${esc(v.colour || '-')} | Size: ${esc(getShoeDisplaySize(v.size, v.products))}</small></td><td class="r"><b>${it.qty}</b></td></tr>`;
    })
    .join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Dispatch Voucher</title>
<style>
@page { size: 80mm auto; margin: 3mm; }
body { font-family: 'Courier New', monospace; width: 74mm; margin: 0 auto; font-size: 11px; color: #000; }
h1 { font-size: 16px; text-align: center; margin: 0; letter-spacing: 2px; }
.c { text-align: center; } .r { text-align: right; }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
table { width: 100%; border-collapse: collapse; } td { padding: 3px 2px; vertical-align: top; }
small { font-size: 9px; }
.sig { margin-top: 28px; border-top: 1px solid #000; text-align: center; font-size: 9px; padding-top: 2px; }
</style></head><body>
<h1>FASHION FEET</h1><div class="c"><small>MULTI-BRANCH INVENTORY DISPATCH VOUCHER</small></div><hr>
<div>Voucher No: <b>${esc(voucherNumber(d))}</b></div>
<div>Date: ${esc(d.date)}</div>
<div>Type: ${esc(voucherType(d))}</div><hr>
<div>FROM: <b>${esc(d.fromName)}</b></div>
<div>TO: <b>${esc(d.toName)}</b></div>
${d.driverNotes ? `<div>Notes: ${esc(d.driverNotes)}</div>` : ''}<hr>
<table>${rows}</table><hr>
<div>Line items: <b>${d.items.length}</b></div>
<div>TOTAL PAIRS: <b>${voucherPairs(d)}</b></div>
<div class="sig">Dispatched By: ${esc(d.dispatchedByName)}</div>
<div class="sig">Transported By (Driver)</div>
<div class="sig">Received &amp; Verified By</div>
<script>window.onload=function(){window.focus();window.print();}<\/script>
</body></html>`);
  w.document.close();
  return true;
}
