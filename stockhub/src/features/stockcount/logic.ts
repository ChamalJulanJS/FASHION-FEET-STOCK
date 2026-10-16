import { app, getShoeDisplaySize, fmtMoney } from '../../lib/app.svelte';
import type { Variant } from '../../lib/types';

export type CountMode = 'audit' | 'add';

export interface CountedVariantLine {
  variantId: string; // Either real Supabase UUID or 'custom_...'
  productId: string;
  sku: string;
  barcode: string;
  size: string;
  displaySize: string;
  colour: string;
  sellingPrice: number;
  costPrice: number;
  systemStock: number;
  countedQty: number;
  isCustom?: boolean;
  lastScannedAt?: number;
}

export interface CountedModelGroup {
  productId: string;
  name: string;
  brand: string;
  category: string;
  gender: string;
  sellingPrice: number;
  costPrice: number;
  isCustomModel?: boolean;
  lines: CountedVariantLine[];
}

export interface StockCountDraft {
  locationId: string;
  mode: CountMode;
  sessionTitle: string;
  notes: string;
  groups: CountedModelGroup[];
  updatedAt: string;
}

const DRAFT_KEY = 'ff_stock_count_draft_v1';

export function loadStockCountDraft(): StockCountDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.groups)) return parsed as StockCountDraft;
  } catch (e) {
    console.warn('Failed to load stock count draft:', e);
  }
  return null;
}

export function saveStockCountDraft(draft: StockCountDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {
    console.warn('Failed to save stock count draft:', e);
  }
}

export function clearStockCountDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

export function sortLinesBySize<T extends { size?: string | null }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => {
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

export function buildGroupFromCatalogProduct(productId: string, variants: Variant[], locationId: string): CountedModelGroup {
  const first = variants[0];
  const p = first?.products || { id: productId, name: first?.sku || 'Shoe Model', brand: 'Generic', category: 'General', gender: '' };
  const sorted = sortLinesBySize(variants);
  const lines: CountedVariantLine[] = sorted.map((v) => ({
    variantId: v.id,
    productId,
    sku: v.sku || '',
    barcode: v.barcode || '',
    size: (v.size || '').toString().trim() || '-',
    displaySize: getShoeDisplaySize(v.size, p),
    colour: v.colour || '',
    sellingPrice: Number(v.selling_price) || 0,
    costPrice: Number(v.cost_price) || 0,
    systemStock: app.getStock(v.id, locationId),
    countedQty: 0,
    isCustom: false,
  }));

  return {
    productId,
    name: p.name || first?.sku || 'Shoe Model',
    brand: p.brand || 'Generic',
    category: p.category || 'General',
    gender: p.gender || '',
    sellingPrice: Number(first?.selling_price) || 0,
    costPrice: Number(first?.cost_price) || 0,
    isCustomModel: false,
    lines,
  };
}

function csvCell(val: string | number | null | undefined): string {
  const s = (val ?? '').toString().replace(/"/g, '""');
  return `"${s}"`;
}

function triggerCsvDownload(csvContent: string, filename: string) {
  // Include UTF-8 BOM so Microsoft Excel opens columns and characters properly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

/**
 * 1. Detailed Row-per-Size/SKU Excel CSV Export
 * Ideal for POS import, database audit, or detailed line-by-line Excel filtering.
 */
export function exportDetailedStockCountCSV(
  groups: CountedModelGroup[],
  locationName: string,
  mode: CountMode,
  sessionTitle: string,
  onlyNonZero = false,
) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const headers = [
    'Shop / Branch',
    'Count Date',
    'Session / Note',
    'Mode',
    'Model Code / Name',
    'Brand',
    'Category',
    'SKU',
    'Barcode',
    'Size (UK/EU)',
    'Raw Size',
    'Colour',
    'Cost Price (Rs)',
    'Selling Price (Rs)',
    'System Stock',
    mode === 'audit' ? 'Counted Physical Qty' : 'Added Qty (+)',
    'Variance / Diff',
    'Final Shop Stock',
    'Counted Retail Value (Rs)',
  ];

  const rows: string[] = [headers.map(csvCell).join(',')];

  for (const g of groups) {
    for (const l of sortLinesBySize(g.lines)) {
      if (onlyNonZero && l.countedQty === 0 && l.systemStock === 0) continue;
      const finalStock = mode === 'audit' ? l.countedQty : l.systemStock + l.countedQty;
      const diff = mode === 'audit' ? l.countedQty - l.systemStock : l.countedQty;
      const retailVal = l.countedQty * (l.sellingPrice || g.sellingPrice || 0);

      rows.push(
        [
          locationName,
          dateStr,
          sessionTitle || 'Shop Stock Count',
          mode === 'audit' ? 'Physical Audit' : 'Stock In (+Add)',
          g.name,
          g.brand,
          g.category,
          l.sku,
          l.barcode,
          l.displaySize,
          l.size,
          l.colour,
          (l.costPrice || g.costPrice || 0).toFixed(2),
          (l.sellingPrice || g.sellingPrice || 0).toFixed(2),
          l.systemStock,
          l.countedQty,
          diff > 0 ? `+${diff}` : `${diff}`,
          finalStock,
          retailVal.toFixed(2),
        ]
          .map(csvCell)
          .join(','),
      );
    }
  }

  const cleanShop = (locationName || 'Shop').replace(/[^a-zA-Z0-9_-]/g, '_');
  triggerCsvDownload(rows.join('\r\n'), `FashionFeet_StockCount_Detailed_${cleanShop}_${dateStr}.csv`);
}

/**
 * 2. Shoe Size-Matrix Excel CSV Export (One row per Shoe Model, Sizes as columns)
 * Ideal for footwear shop spreadsheets where each model row shows quantities across sizes.
 */
export function exportMatrixStockCountCSV(
  groups: CountedModelGroup[],
  locationName: string,
  mode: CountMode,
  sessionTitle: string,
) {
  const dateStr = new Date().toISOString().slice(0, 10);

  // Collect all unique raw sizes present across counted groups, sorted naturally
  const sizeSet = new Set<string>();
  for (const g of groups) {
    for (const l of g.lines) {
      if (l.countedQty > 0 || l.systemStock > 0) {
        sizeSet.add((l.size || '-').trim());
      }
    }
  }
  const allSizes = sortLinesBySize(Array.from(sizeSet).map((s) => ({ size: s }))).map((x) => x.size);
  if (allSizes.length === 0) {
    ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'].forEach((s) => allSizes.push(s));
  }

  const headers = [
    'Shop / Branch',
    'Date',
    'Model Code / Name',
    'Brand',
    'Category',
    'Selling Price (Rs)',
    ...allSizes.map((s) => `Sz ${s}`),
    'System Pairs',
    mode === 'audit' ? 'Counted Pairs' : 'Added Pairs',
    'Variance',
    'Total Counted Value (Rs)',
  ];

  const rows: string[] = [headers.map(csvCell).join(',')];

  for (const g of groups) {
    const modelCounted = g.lines.reduce((s, l) => s + l.countedQty, 0);
    const modelSys = g.lines.reduce((s, l) => s + l.systemStock, 0);
    if (modelCounted === 0 && modelSys === 0) continue;

    const sizeCells = allSizes.map((sz) => {
      const matching = g.lines.filter((l) => (l.size || '-').trim() === sz);
      const sum = matching.reduce((s, l) => s + l.countedQty, 0);
      return sum > 0 ? sum : '';
    });

    const diff = mode === 'audit' ? modelCounted - modelSys : modelCounted;
    const totalVal = g.lines.reduce((s, l) => s + l.countedQty * (l.sellingPrice || g.sellingPrice || 0), 0);

    rows.push(
      [
        locationName,
        dateStr,
        g.name,
        g.brand,
        g.category,
        (g.sellingPrice || 0).toFixed(2),
        ...sizeCells,
        modelSys,
        modelCounted,
        diff > 0 ? `+${diff}` : `${diff}`,
        totalVal.toFixed(2),
      ]
        .map(csvCell)
        .join(','),
    );
  }

  const cleanShop = (locationName || 'Shop').replace(/[^a-zA-Z0-9_-]/g, '_');
  triggerCsvDownload(rows.join('\r\n'), `FashionFeet_StockCount_Matrix_${cleanShop}_${dateStr}.csv`);
}

/**
 * 3. WhatsApp Summary Builder
 */
export function buildStockCountWhatsApp(
  groups: CountedModelGroup[],
  locationName: string,
  mode: CountMode,
  sessionTitle: string,
): string {
  const dateStr = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  let totalModels = 0;
  let totalSys = 0;
  let totalCounted = 0;
  let totalValue = 0;

  const linesOut: string[] = [];
  linesOut.push(`*FASHION FEET — SHOP STOCK COUNT*`);
  linesOut.push(`Shop: *${locationName || 'Branch'}*`);
  linesOut.push(`Mode: ${mode === 'audit' ? 'Physical Stock Audit' : 'Stock In (+Add)'}`);
  if (sessionTitle.trim()) linesOut.push(`Ref: ${sessionTitle.trim()}`);
  linesOut.push(`Date: ${dateStr}`);
  linesOut.push(`--------------------------------`);

  for (const g of groups) {
    const activeLines = sortLinesBySize(g.lines).filter((l) => l.countedQty > 0 || (mode === 'audit' && l.systemStock > 0));
    if (activeLines.length === 0) continue;
    totalModels++;
    const gSys = g.lines.reduce((s, l) => s + l.systemStock, 0);
    const gCnt = g.lines.reduce((s, l) => s + l.countedQty, 0);
    const gVal = g.lines.reduce((s, l) => s + l.countedQty * (l.sellingPrice || g.sellingPrice || 0), 0);
    totalSys += gSys;
    totalCounted += gCnt;
    totalValue += gVal;

    const sizeBreakdown = activeLines
      .filter((l) => l.countedQty > 0)
      .map((l) => `Sz ${l.displaySize}: *${l.countedQty}*`)
      .join(' | ');

    const diff = gCnt - gSys;
    const diffTag = mode === 'audit' ? ` (Sys: ${gSys}, Diff: ${diff >= 0 ? '+' + diff : diff})` : '';
    linesOut.push(`• *${g.name}* (${g.brand}) — *${gCnt} prs*${diffTag}`);
    if (sizeBreakdown) linesOut.push(`   ${sizeBreakdown}`);
  }

  linesOut.push(`--------------------------------`);
  linesOut.push(`Models Counted: *${totalModels}*`);
  if (mode === 'audit') {
    const netDiff = totalCounted - totalSys;
    linesOut.push(`System Pairs: *${totalSys}*`);
    linesOut.push(`Counted Pairs: *${totalCounted}*`);
    linesOut.push(`Net Variance: *${netDiff >= 0 ? '+' + netDiff : netDiff} pairs*`);
  } else {
    linesOut.push(`Total Added Pairs: *+${totalCounted} pairs*`);
  }
  linesOut.push(`Counted Value: *${fmtMoney(totalValue)}*`);

  return linesOut.join('\n');
}

/**
 * 4. Printable A4 / Thermal Stock Audit Report
 */
export function printStockCountSheet(
  groups: CountedModelGroup[],
  locationName: string,
  mode: CountMode,
  sessionTitle: string,
  staffName: string,
) {
  const dateStr = new Date().toLocaleString('en-GB');
  let totalModels = 0;
  let totalSys = 0;
  let totalCounted = 0;
  let totalValue = 0;

  let rowsHtml = '';
  for (const g of groups) {
    const gSys = g.lines.reduce((s, l) => s + l.systemStock, 0);
    const gCnt = g.lines.reduce((s, l) => s + l.countedQty, 0);
    if (gCnt === 0 && gSys === 0) continue;
    totalModels++;
    const gVal = g.lines.reduce((s, l) => s + l.countedQty * (l.sellingPrice || g.sellingPrice || 0), 0);
    totalSys += gSys;
    totalCounted += gCnt;
    totalValue += gVal;
    const diff = mode === 'audit' ? gCnt - gSys : gCnt;

    const sizesHtml = sortLinesBySize(g.lines)
      .filter((l) => l.countedQty > 0 || l.systemStock > 0)
      .map((l) => {
        const lDiff = l.countedQty - l.systemStock;
        const badgeStyle =
          mode === 'audit' && lDiff !== 0
            ? lDiff > 0
              ? 'border-color:#16a34a;background:#f0fdf4;'
              : 'border-color:#dc2626;background:#fef2f2;'
            : 'border-color:#d4d4d8;background:#fafafa;';
        return `<span style="display:inline-block;border:1px solid;${badgeStyle}border-radius:4px;padding:2px 6px;margin:2px;font-size:11px;font-family:monospace;">
          <b>Sz ${l.displaySize}:</b> ${l.countedQty}${mode === 'audit' ? ` <span style="color:#71717a;">(sys:${l.systemStock})</span>` : ''}
        </span>`;
      })
      .join('');

    rowsHtml += `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e4e4e7;font-weight:700;">
          ${g.name}
          <div style="font-size:11px;font-weight:400;color:#71717a;">${g.brand} • ${g.category} • ${fmtMoney(g.sellingPrice)}</div>
        </td>
        <td style="padding:8px;border-bottom:1px solid #e4e4e7;">${sizesHtml || '-'}</td>
        <td style="padding:8px;border-bottom:1px solid #e4e4e7;text-align:right;font-family:monospace;">${gSys}</td>
        <td style="padding:8px;border-bottom:1px solid #e4e4e7;text-align:right;font-family:monospace;font-weight:700;font-size:14px;">${gCnt}</td>
        <td style="padding:8px;border-bottom:1px solid #e4e4e7;text-align:right;font-family:monospace;font-weight:700;color:${diff < 0 ? '#dc2626' : diff > 0 ? '#16a34a' : '#18181b'};">
          ${diff > 0 ? '+' + diff : diff}
        </td>
        <td style="padding:8px;border-bottom:1px solid #e4e4e7;text-align:right;font-family:monospace;">${fmtMoney(gVal)}</td>
      </tr>
    `;
  }

  const netDiff = mode === 'audit' ? totalCounted - totalSys : totalCounted;
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FashionFeet Stock Count — ${locationName}</title>
  <style>
    body { font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; color: #09090b; margin: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
    th { text-align: left; padding: 8px; border-bottom: 2px solid #18181b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #52525b; }
    .kpis { display: flex; gap: 16px; margin-top: 14px; flex-wrap: wrap; }
    .kpi { border: 1px solid #d4d4d8; border-radius: 8px; padding: 10px 14px; min-width: 130px; }
    .kpi-label { font-size: 10px; text-transform: uppercase; color: #71717a; font-weight: 600; }
    .kpi-val { font-size: 18px; font-weight: 800; font-family: monospace; margin-top: 2px; }
    @media print { .no-print { display: none; } body { margin: 8px; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px;display:flex;gap:8px;">
    <button onclick="window.print()" style="background:#09090b;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;">Print Sheet</button>
    <button onclick="window.close()" style="background:#f4f4f5;color:#09090b;border:1px solid #d4d4d8;padding:8px 16px;border-radius:6px;cursor:pointer;">Close</button>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #09090b;padding-bottom:12px;">
    <div>
      <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;">FASHION FEET — SHOP STOCK COUNT</div>
      <div style="font-size:13px;color:#52525b;margin-top:2px;">
        Branch: <b>${locationName}</b> &bull; Mode: <b>${mode === 'audit' ? 'Physical Stock Audit' : 'Stock In (+Add)'}</b>
        ${sessionTitle ? ` &bull; Ref: <b>${sessionTitle}</b>` : ''}
      </div>
    </div>
    <div style="text-align:right;font-size:12px;color:#52525b;">
      <div>Date: <b>${dateStr}</b></div>
      <div>Prepared by: <b>${staffName}</b></div>
    </div>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Models Counted</div><div class="kpi-val">${totalModels}</div></div>
    <div class="kpi"><div class="kpi-label">System Pairs</div><div class="kpi-val">${totalSys}</div></div>
    <div class="kpi"><div class="kpi-label">${mode === 'audit' ? 'Counted Pairs' : 'Added Pairs'}</div><div class="kpi-val">${totalCounted}</div></div>
    <div class="kpi"><div class="kpi-label">Variance</div><div class="kpi-val">${netDiff > 0 ? '+' + netDiff : netDiff}</div></div>
    <div class="kpi"><div class="kpi-label">Counted Retail Value</div><div class="kpi-val">${fmtMoney(totalValue)}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Shoe Model</th>
        <th>Size Breakdown</th>
        <th style="text-align:right;">System</th>
        <th style="text-align:right;">Counted</th>
        <th style="text-align:right;">Diff</th>
        <th style="text-align:right;">Value</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=720');
  if (!win) {
    app.toast('Popup blocked — please allow popups to print the sheet.', 'warning');
    return;
  }
  win.document.write(html);
  win.document.close();
}
