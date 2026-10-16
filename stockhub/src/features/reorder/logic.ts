import { app, getShoeDisplaySize, isMenShoe } from '../../lib/app.svelte';
import type { Variant } from '../../lib/types';

export interface ModelVariant extends Variant {
  displaySize: string;
  stock: number;
}

export interface MatchModel {
  productId: string;
  name: string;
  brand: string;
  category: string;
  gender: string;
  productObj: any;
  totalStock: number;
  hasZeroStock: boolean;
  hasLowStock: boolean;
  sellingPrice: number;
  costPrice: number;
  variants: ModelVariant[];
}

export interface SheetVariant {
  variantId: string;
  sku: string;
  size: string;
  displaySize: string;
  colour: string;
  currentStock: number;
  costPrice: number;
  orderQty: number;
  isCustom?: boolean;
}

export interface SheetItem {
  productId: string;
  name: string;
  brand: string;
  category: string;
  gender: string;
  sellingPrice: number;
  costPrice: number;
  variants: SheetVariant[];
}

export interface StockFilters {
  locId: string;
  brand: string;
  cat: string;
  status: string;
  query: string;
}

/** Natural size sorter (numeric first, then alphanumeric). */
export function sortVariantsBySize<T extends { size?: string | null }>(variants: T[]): T[] {
  return [...variants].sort((a, b) => {
    const szA = (a.size || '').trim();
    const szB = (b.size || '').trim();
    const numA = parseFloat(szA);
    const numB = parseFloat(szB);
    const isNumA = !isNaN(numA);
    const isNumB = !isNaN(numB);
    if (isNumA && isNumB) return numA - numB;
    if (isNumA && !isNumB) return -1;
    if (!isNumA && isNumB) return 1;
    return szA.localeCompare(szB);
  });
}

export function getVariantStock(variantId: string, locId: string) {
  if (locId === 'ALL') {
    let total = 0;
    for (const loc of app.locations) total += app.stockMap.get(`${variantId}_${loc.id}`) || 0;
    return total;
  }
  return app.stockMap.get(`${variantId}_${locId}`) || 0;
}

/** Brand / category dropdown options with variant counts (legacy: counted per catalog variant). */
export function countOptions(kind: 'brand' | 'category') {
  const counts = new Map<string, number>();
  for (const v of app.catalog) {
    const raw = kind === 'brand' ? v.products?.brand : v.products?.category;
    const k = (raw ? raw.trim() : '') || (kind === 'brand' ? 'Generic' : 'General');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return Array.from(counts.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((k) => ({ value: k, count: counts.get(k)! }));
}

export function getMatchingModels(f: StockFilters) {
  const { brand, cat, status, locId } = f;
  const q = (f.query || '').trim().toLowerCase();
  const matchingModels: MatchModel[] = [];
  let needsOrderCount = 0;

  for (const [productId, variants] of app.productsMap.entries()) {
    if (!variants || variants.length === 0) continue;
    const p: any = variants[0].products || {};
    const pName: string = p.name || variants[0].sku || 'Shoe Model';
    const pBrand: string = p.brand || 'Generic';
    const pCat: string = p.category || 'General';

    if (brand !== 'ALL' && pBrand !== brand) continue;
    if (cat !== 'ALL' && pCat !== cat) continue;

    if (q) {
      const matchName = pName.toLowerCase().includes(q);
      const matchBrand = pBrand.toLowerCase().includes(q);
      const matchCat = pCat.toLowerCase().includes(q);
      const matchSku = variants.some(
        (v) => (v.sku && v.sku.toLowerCase().includes(q)) || (v.barcode && v.barcode.toLowerCase().includes(q)),
      );
      const matchSize = variants.some((v) => {
        const raw = (v.size || '').toLowerCase();
        const disp = getShoeDisplaySize(v.size, p).toLowerCase();
        return raw === q || disp.includes(q);
      });
      if (!matchName && !matchBrand && !matchCat && !matchSku && !matchSize) continue;
    }

    let modelTotalStock = 0;
    let hasZeroStock = false;
    let hasLowStock = false;

    const sortedVars: ModelVariant[] = sortVariantsBySize(variants).map((v) => {
      const stock = getVariantStock(v.id, locId);
      modelTotalStock += stock;
      if (stock === 0) hasZeroStock = true;
      if (stock <= 2) hasLowStock = true;
      return { ...v, displaySize: getShoeDisplaySize(v.size, p), stock };
    });

    if (hasZeroStock) needsOrderCount++;

    if ((status === 'OUT_OF_STOCK' || status === 'ZERO_STOCK') && !hasZeroStock) continue;
    if (status === 'LOW_STOCK' && !hasLowStock) continue;
    if (status === 'IN_STOCK' && hasLowStock) continue;

    matchingModels.push({
      productId,
      name: pName,
      brand: pBrand,
      category: pCat,
      gender: p.gender || '',
      productObj: p,
      totalStock: modelTotalStock,
      hasZeroStock,
      hasLowStock,
      sellingPrice: Number(variants[0].selling_price) || 0,
      costPrice: Number(variants[0].cost_price) || 0,
      variants: sortedVars,
    });
  }
  return { matchingModels, needsOrderCount };
}

export function buildSheetItem(productId: string, locId: string): SheetItem | null {
  const variants = app.productsMap.get(productId);
  if (!variants || variants.length === 0) return null;
  const p: any = variants[0].products || {};
  return {
    productId,
    name: p.name || variants[0].sku || 'Shoe Model',
    brand: p.brand || 'Generic',
    category: p.category || 'General',
    gender: p.gender || '',
    sellingPrice: Number(variants[0].selling_price) || 0,
    costPrice: Number(variants[0].cost_price) || 0,
    variants: sortVariantsBySize(variants).map((v) => {
      const stock = getVariantStock(v.id, locId);
      return {
        variantId: v.id,
        sku: v.sku,
        size: v.size || '-',
        displaySize: getShoeDisplaySize(v.size, p),
        colour: v.colour || '-',
        currentStock: stock,
        costPrice: Number(v.cost_price) || Number(variants[0].cost_price) || 0,
        orderQty: stock === 0 ? 3 : stock <= 2 ? 2 : 0,
      };
    }),
  };
}

/** Handles men's shoe UK -> EU mapping (typed 6 for a model using EU 40). */
export function normalizeSizeInput(inputSize: string | number, item: SheetItem) {
  const s = (inputSize || '').toString().trim();
  if (!s) return '';
  const num = parseFloat(s);
  const hasEuSizes = item.variants.some((v) => {
    const n = parseFloat(v.size);
    return !isNaN(n) && n >= 35 && n <= 48;
  });
  if (hasEuSizes && isMenShoe(item) && !isNaN(num) && num >= 3 && num <= 14) {
    return (num + 34).toString();
  }
  return s;
}

/** Standard quick-add sizes for the Add Size modal. */
export function standardSizesFor(item: SheetItem) {
  const isMen = isMenShoe(item);
  const nameUpper = (item.name || '').toUpperCase();
  const catUpper = (item.category || '').toUpperCase();
  const isKids =
    nameUpper.includes('KID') || catUpper.includes('KID') || nameUpper.includes('BABY') || catUpper.includes('BABY');
  let sizes: number[];
  if (isKids) sizes = [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
  else if (isMen) sizes = [38, 39, 40, 41, 42, 43, 44, 45, 46];
  else sizes = [35, 36, 37, 38, 39, 40, 41];
  return sizes.map((sz) => {
    const exists = item.variants.some((v) => {
      const s = (v.size || '').toString().trim();
      return s === sz.toString() || (isMen && s === (sz - 34).toString());
    });
    return { sz, disp: getShoeDisplaySize(sz.toString(), item), exists };
  });
}

// ---------------------------------------------------------------------------
// Branch naming
// ---------------------------------------------------------------------------
export const ALL_BRANCHES_LABEL = 'All Branches Combined (සියලු ශාඛා)';

/** Name as shown in the branch dropdown (legacy used option text). */
export function branchOptionName(locId: string) {
  if (locId === 'ALL') return ALL_BRANCHES_LABEL;
  return app.locations.find((l) => l.id === locId)?.name ?? ALL_BRANCHES_LABEL;
}

export function shortBranchLabel(locId: string) {
  if (locId === 'ALL') return 'Print Stock (All)';
  const loc = app.locations.find((l) => l.id === locId);
  const shortName = loc ? (loc.name.length > 12 ? loc.name.slice(0, 11) + '…' : loc.name) : 'Branch';
  return `Print Stock (${shortName})`;
}

// ---------------------------------------------------------------------------
// Reorder sheet outputs
// ---------------------------------------------------------------------------
function dateStamp() {
  const now = new Date();
  return now.toLocaleDateString('en-GB') + ' ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function buildWhatsAppMessage(sheet: SheetItem[], locId: string, notesRaw: string) {
  if (sheet.length === 0) return null;
  const branchName = branchOptionName(locId).replace(/^[^\w\s]+/, '').trim();
  const dateStr = dateStamp();
  const notes = (notesRaw || '').trim();

  let totalPairs = 0;
  let totalCost = 0;
  const lines: string[] = [];
  let idx = 1;
  for (const item of sheet) {
    const orderedSizes = item.variants.filter((v) => (v.orderQty || 0) > 0);
    if (orderedSizes.length === 0) continue;
    let modelPairs = 0;
    const sizeRows: string[] = [];
    orderedSizes.forEach((v) => {
      modelPairs += v.orderQty;
      totalCost += v.orderQty * (v.costPrice || 0);
      sizeRows.push(`   • Size ${v.displaySize || v.size} : *${v.orderQty} pairs* (Stock: ${v.currentStock})`);
    });
    totalPairs += modelPairs;
    lines.push(
      `👟 *${idx}. ${item.brand.toUpperCase()} — ${item.name}* (${item.category})\n${sizeRows.join('\n')}\n   _Model Subtotal: ${modelPairs} Pairs_`,
    );
    idx++;
  }
  if (lines.length === 0) return null;

  let msg = `📦 *FASHION FEET — FOOTWEAR REORDER SHEET*\n`;
  msg += `📅 Date: ${dateStr}\n`;
  msg += `🏬 Branch: ${branchName}\n`;
  if (notes) msg += `📝 Notes: ${notes}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += lines.join('\n\n') + '\n\n';
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 *TOTAL REORDER: ${totalPairs} PAIRS*\n`;
  if (totalCost > 0) {
    msg += `💰 *ESTIMATED COST: LKR ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}*\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Generated via Fashion Feet Inventory Hub_`;
  return { text: msg, totalPairs };
}

export function buildPOHtml(sheet: SheetItem[], locId: string, notesRaw: string) {
  const branchName = branchOptionName(locId).replace(/^[^\w\s]+/, '').trim();
  const dateStr = dateStamp();
  const notes = (notesRaw || '').trim();
  let rowsHtml = '';
  let totalPairs = 0;
  let totalCost = 0;
  for (const item of sheet) {
    item.variants
      .filter((v) => (v.orderQty || 0) > 0)
      .forEach((v) => {
        const lineCost = v.orderQty * (v.costPrice || 0);
        totalPairs += v.orderQty;
        totalCost += lineCost;
        rowsHtml += `
                <tr>
                    <td><strong>${item.brand}</strong> - ${item.name}</td>
                    <td>${item.category}</td>
                    <td style="text-align:center; font-weight:bold;">${v.displaySize || v.size}</td>
                    <td style="text-align:center;">${v.currentStock}</td>
                    <td style="text-align:center; font-weight:bold; font-size:1.05rem;">${v.orderQty}</td>
                    <td style="text-align:right;">Rs. ${(v.costPrice || 0).toLocaleString()}</td>
                    <td style="text-align:right; font-weight:bold;">Rs. ${lineCost.toLocaleString()}</td>
                </tr>
            `;
      });
  }
  return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Fashion Feet — Purchase Reorder Voucher</title>
            <style>
                body { font-family: 'Inter', sans-serif; padding: 25px; color: #1e293b; line-height: 1.5; }
                .po-header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
                .po-title { font-size: 22px; font-weight: 800; text-transform: uppercase; color: #0f172a; }
                .meta-table { width: 100%; margin-bottom: 20px; font-size: 14px; }
                .meta-table td { padding: 4px 0; }
                table.items { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
                table.items th, table.items td { border: 1px solid #cbd5e1; padding: 8px 10px; }
                table.items th { background: #f1f5f9; text-transform: uppercase; font-size: 11px; }
                .total-box { margin-top: 25px; border-top: 2px solid #0f172a; padding-top: 12px; display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; }
                .sig-box { margin-top: 50px; display: flex; justify-content: space-between; font-size: 12px; }
                .sig-line { width: 180px; border-top: 1px dashed #64748b; text-align: center; padding-top: 5px; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="po-header">
                <div>
                    <div class="po-title">👟 Fashion Feet — Purchase Reorder Sheet</div>
                    <div>Footwear Supply &amp; Reordering Note</div>
                </div>
                <div style="text-align: right; font-size: 13px;">
                    <div>Date: <strong>${dateStr}</strong></div>
                    <div>Location: <strong>${branchName}</strong></div>
                </div>
            </div>

            ${notes ? `<div style="background:#f8fafc; padding:8px 12px; border-radius:6px; margin-bottom:15px; font-size:13px;"><strong>Supplier / Notes:</strong> ${notes}</div>` : ''}

            <table class="items">
                <thead>
                    <tr>
                        <th>Brand &amp; Model Code</th>
                        <th>Category</th>
                        <th style="text-align:center;">Size</th>
                        <th style="text-align:center;">Current Stock</th>
                        <th style="text-align:center;">Reorder Qty</th>
                        <th style="text-align:right;">Unit Cost</th>
                        <th style="text-align:right;">Total Cost</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <div class="total-box">
                <div>Total Reorder Pairs: <span style="font-size:20px; color:#0284c7;">${totalPairs} Pairs</span></div>
                <div>Estimated Total Cost: <span style="font-size:20px; color:#16a34a;">Rs. ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            </div>

            <div class="sig-box">
                <div class="sig-line">Prepared By (Staff)</div>
                <div class="sig-line">Store Manager Approval</div>
                <div class="sig-line">Supplier Confirmation</div>
            </div>

            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `;
}

export function buildReorderCsv(sheet: SheetItem[]) {
  let csv = 'Brand,Model Code,Category,Size,Current Stock,Order Qty,Unit Cost,Line Total Cost\n';
  let hasItems = false;
  for (const item of sheet) {
    item.variants
      .filter((v) => (v.orderQty || 0) > 0)
      .forEach((v) => {
        hasItems = true;
        const lineCost = v.orderQty * (v.costPrice || 0);
        csv += `"${item.brand}","${item.name}","${item.category}","${v.displaySize || v.size}",${v.currentStock},${v.orderQty},${v.costPrice || 0},${lineCost}\n`;
      });
  }
  return hasItems ? csv : null;
}

export function reorderCsvFilename() {
  return `FashionFeet_Reorder_${new Date().toISOString().slice(0, 10)}.csv`;
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ---------------------------------------------------------------------------
// Current stock outputs
// ---------------------------------------------------------------------------
export function stockBranchDisplay(locId: string) {
  const locObj = app.locations.find((l) => l.id === locId);
  return locId === 'ALL' ? 'All Branches Combined' : locObj ? locObj.name : 'Branch';
}

export function buildStockCsv(models: MatchModel[], locId: string) {
  const branchDisplay = stockBranchDisplay(locId);
  const locObj = app.locations.find((l) => l.id === locId);
  const branchName = locId === 'ALL' ? 'All_Branches' : locObj ? locObj.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Branch';

  let csv =
    'Branch,Brand,Article_Code,Category,Size,Current_Stock_Pairs,Barcode,Unit_Cost,Selling_Price,Retail_Stock_Value,Cost_Stock_Value\n';
  let grandTotalPairs = 0;
  let grandTotalRetail = 0;
  let grandTotalCost = 0;
  models.forEach((m) => {
    m.variants.forEach((v) => {
      const stock = v.stock || 0;
      const retailVal = stock * (m.sellingPrice || 0);
      const costVal = stock * (m.costPrice || 0);
      grandTotalPairs += stock;
      grandTotalRetail += retailVal;
      grandTotalCost += costVal;
      csv += `"${branchDisplay}","${m.brand}","${m.name}","${m.category}","${v.displaySize || v.size || '-'}","${stock}","${v.barcode || ''}",${m.costPrice || 0},${m.sellingPrice || 0},${retailVal},${costVal}\n`;
    });
  });
  csv += `\n"TOTAL","","${models.length} Models","","","${grandTotalPairs} Pairs","","","",${grandTotalRetail},${grandTotalCost}\n`;
  return {
    csv,
    grandTotalPairs,
    branchDisplay,
    filename: `FashionFeet_Stock_${branchName}_${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

export function buildStockPrintHtml(models: MatchModel[], locId: string, brand: string, cat: string, status: string) {
  const branchName = stockBranchDisplay(locId);
  const dateStr = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  let grandTotalPairs = 0;
  let grandTotalRetail = 0;
  let rowsHtml = '';
  models.forEach((m) => {
    grandTotalPairs += m.totalStock;
    grandTotalRetail += m.totalStock * m.sellingPrice;
    const sizeChips = m.variants
      .map((v) => {
        const isZero = v.stock === 0;
        const isLow = v.stock <= 2 && v.stock > 0;
        const color = isZero ? '#dc2626' : isLow ? '#d97706' : '#16a34a';
        return `<span style="display:inline-block; margin:2px 4px; padding:2px 6px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px; background:${isZero ? '#fef2f2' : '#f8fafc'};">
                <span style="color:#64748b;">${v.displaySize || v.size}:</span> <strong style="color:${color}; font-size:12px;">${v.stock}</strong>
            </span>`;
      })
      .join('');
    rowsHtml += `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:8px 10px;">
                    <div style="font-weight:700; color:#0f172a; font-size:13px;">${m.name}</div>
                    <div style="font-size:11px; color:#64748b;">${m.brand} • ${m.category}</div>
                </td>
                <td style="padding:8px 10px;">${sizeChips}</td>
                <td style="padding:8px 10px; text-align:center; font-weight:700; font-size:13px;">${m.totalStock} prs</td>
                <td style="padding:8px 10px; text-align:right; font-size:12px;">Rs. ${m.sellingPrice.toLocaleString()}</td>
                <td style="padding:8px 10px; text-align:right; font-weight:700; font-size:12px; color:#0284c7;">Rs. ${(m.totalStock * m.sellingPrice).toLocaleString()}</td>
            </tr>
        `;
  });

  return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Fashion Feet — Live Stock Inventory Report (${branchName})</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; color: #1e293b; }
                .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
                .report-title { font-size: 20px; font-weight: 800; color: #4338ca; text-transform: uppercase; letter-spacing: 0.5px; }
                .report-sub { font-size: 13px; color: #64748b; margin-top: 3px; }
                .meta-col { text-align: right; font-size: 12px; line-height: 1.5; }
                .branch-pill { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 13px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
                .total-bar { display: flex; justify-content: space-between; background: #e0e7ff; padding: 12px 16px; border-radius: 6px; margin-top: 20px; font-weight: 700; font-size: 14px; }
                .sig-row { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 10px; }
                .sig-box { width: 30%; text-align: center; border-top: 1px dashed #94a3b8; font-size: 11px; color: #64748b; padding-top: 6px; }
                @media print { body { margin: 10mm; } }
            </style>
        </head>
        <body>
            <div class="report-header">
                <div>
                    <div class="report-title">👟 FASHION FEET — LIVE STOCK INVENTORY REPORT</div>
                    <div class="report-sub">Real-Time Branch Stock Matrix &amp; Valuation Sheet</div>
                </div>
                <div class="meta-col">
                    <div><strong>Branch:</strong> <span class="branch-pill">${branchName}</span></div>
                    <div><strong>Date &amp; Time:</strong> ${dateStr}</div>
                    <div><strong>Filter:</strong> ${brand !== 'ALL' ? brand : 'All Brands'} • ${cat !== 'ALL' ? cat : 'All Categories'} • ${status !== 'ALL' ? status : 'All Levels'}</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width:25%;">Shoe Model / Code</th>
                        <th style="width:45%;">Size Stock Breakdown</th>
                        <th style="width:10%; text-align:center;">Total Qty</th>
                        <th style="width:10%; text-align:right;">Sell Price</th>
                        <th style="width:10%; text-align:right;">Stock Value</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <div class="total-bar">
                <div>Total Styles: <strong>${models.length} Models</strong></div>
                <div>Total Pairs in Stock: <strong style="color:#4338ca; font-size:16px;">${grandTotalPairs} Pairs</strong></div>
                <div>Total Retail Inventory Value: <strong style="color:#15803d; font-size:16px;">Rs. ${grandTotalRetail.toLocaleString()}</strong></div>
            </div>

            <div class="sig-row">
                <div class="sig-box">Audited By (Stock Keeper)</div>
                <div class="sig-box">Showroom Manager Approval</div>
                <div class="sig-box">Head Office Inventory Sync</div>
            </div>

            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `;
}

export function buildStockWhatsApp(models: MatchModel[], locId: string, brand: string, cat: string) {
  const branchName = stockBranchDisplay(locId);
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  let totalPairs = 0;
  let text = `👟 *FASHION FEET — CURRENT STOCK LIST*\n`;
  text += `🏬 *Branch:* ${branchName}\n`;
  text += `📅 *Date:* ${dateStr}\n`;
  if (brand !== 'ALL' || cat !== 'ALL') {
    text += `🔍 *Filter:* ${brand !== 'ALL' ? brand : 'All Brands'} | ${cat !== 'ALL' ? cat : 'All Categories'}\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  models.forEach((m) => {
    totalPairs += m.totalStock;
    const sizeParts = m.variants.map((v) => `${v.displaySize || v.size}:${v.stock}`).join(' | ');
    text += `*${m.name}* (${m.brand})\n`;
    text += `👉 ${sizeParts}\n`;
    text += `📊 *Total: ${m.totalStock} prs* (Rs. ${m.sellingPrice.toLocaleString()})\n\n`;
  });
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📊 *GRAND TOTAL:* ${totalPairs} Pairs across ${models.length} styles.\n`;
  return { text, totalPairs, branchName };
}
