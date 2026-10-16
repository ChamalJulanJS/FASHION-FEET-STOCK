import { app, getShoeDisplaySize, fmtMoney } from '../../lib/app.svelte';
import type { Variant } from '../../lib/types';

export type CountMode = 'audit' | 'add';

export const COMMON_SHOE_COLOURS = [
  'All / Default',
  'Black',
  'Brown',
  'Tan',
  'Dark Brown',
  'White',
  'Beige / Nude',
  'Navy / Blue',
  'Grey',
  'Maroon / Red',
  'Green',
  'Gold',
  'Silver',
  'Multi',
];

export const EXCEL_SIZES_1_TO_50 = Array.from({ length: 50 }, (_, i) => String(i + 1));

/**
 * Splits a scanned barcode or SKU where the LAST 2 DIGITS represent the shoe size (01..50)
 * and the prefix represents the Base Model SKU.
 * Examples:
 *  - "SL10537" -> { baseSku: "SL105", size: "37" }
 *  - "SL10506" -> { baseSku: "SL105", size: "6" }
 *  - "SFW006-41" -> { baseSku: "SFW006", size: "41" }
 */
export function extractBaseSkuAndSize(rawCode: string): { baseSku: string; size: string | null } {
  const clean = (rawCode || '').trim().toUpperCase();
  if (!clean) return { baseSku: '', size: null };

  // 1. Check explicit separator first (e.g. SFW006-41 or SFW006_8)
  const sepMatch = clean.match(/^(.+?)[-_\/](\d{1,2})$/);
  if (sepMatch) {
    const num = parseInt(sepMatch[2], 10);
    if (num >= 1 && num <= 50) {
      return { baseSku: sepMatch[1].trim(), size: String(num) };
    }
  }

  // 2. Check last 2 digits (01 to 50) when total length is at least 4 chars
  if (clean.length >= 4) {
    const last2 = clean.slice(-2);
    if (/^\d{2}$/.test(last2)) {
      const num = parseInt(last2, 10);
      if (num >= 1 && num <= 50) {
        const prefix = clean.slice(0, -2).replace(/[-_\/]+$/, '').trim();
        if (prefix.length >= 2) {
          return { baseSku: prefix, size: String(num) };
        }
      }
    }
  }

  return { baseSku: clean, size: null };
}

/** Normalize a raw size string so "06" -> "6", "40" -> "40" */
export function normalizeSizeKey(rawSize?: string | number | null): string {
  const s = (rawSize ?? '').toString().trim();
  if (!s) return '-';
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= 1 && n <= 50) return String(n);
  }
  return s;
}

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
  groupKey: string; // Unique key per (baseSku + colour)
  productId: string;
  name: string; // Base Model SKU / Name
  colour: string;
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

export interface SavedStockSnapshot {
  id: string;
  title: string;
  locationId: string;
  locationName: string;
  mode: CountMode;
  totalModels: number;
  totalPairs: number;
  savedAt: string;
  groups: CountedModelGroup[];
}

const DRAFT_KEY = 'ff_stock_count_draft_v2';
const LEGACY_DRAFT_KEY = 'ff_stock_count_draft_v1';
const SNAPSHOTS_KEY = 'ff_stock_count_snapshots_v1';

export function loadStockCountDraft(): StockCountDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY) || localStorage.getItem(LEGACY_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.groups)) {
      for (const g of parsed.groups) {
        if (!g.colour) g.colour = 'All / Default';
        if (!g.groupKey) g.groupKey = `${g.productId}__${g.colour}`;
      }
      return parsed as StockCountDraft;
    }
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
    localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {}
}

export function loadSavedSnapshots(): SavedStockSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSnapshotToStorage(snap: SavedStockSnapshot): SavedStockSnapshot[] {
  try {
    const list = loadSavedSnapshots().filter((s) => s.id !== snap.id);
    list.unshift(snap);
    const trimmed = list.slice(0, 25);
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch {
    return [];
  }
}

export function deleteSnapshotFromStorage(id: string): SavedStockSnapshot[] {
  try {
    const list = loadSavedSnapshots().filter((s) => s.id !== id);
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(list));
    return list;
  } catch {
    return [];
  }
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

/**
 * Finds all catalog variants that share the same Base Model SKU (or product_id),
 * even if they were saved as separate product records in the database!
 */
export function findCatalogVariantsForBaseSku(baseSku: string, fallbackProductId?: string): Variant[] {
  const cleanBase = baseSku.trim().toUpperCase();
  const matched = new Map<string, Variant>();

  if (fallbackProductId) {
    const byPid = app.productsMap.get(fallbackProductId) || [];
    for (const v of byPid) matched.set(v.id, v);
  }

  for (const v of app.catalog) {
    const vSkuSplit = extractBaseSkuAndSize(v.sku || '');
    const vBarSplit = extractBaseSkuAndSize(v.barcode || '');
    const pName = (v.products?.name || '').trim().toUpperCase();
    const pNameSplit = extractBaseSkuAndSize(pName);

    if (
      vSkuSplit.baseSku === cleanBase ||
      vBarSplit.baseSku === cleanBase ||
      pName === cleanBase ||
      pNameSplit.baseSku === cleanBase
    ) {
      matched.set(v.id, v);
    }
  }

  return Array.from(matched.values());
}

export function buildGroupFromCatalogProduct(
  productId: string,
  variants: Variant[],
  locationId: string,
  colourOverride?: string,
  baseNameOverride?: string,
): CountedModelGroup {
  const first = variants[0];
  const rawProdName = first?.products?.name || first?.sku || 'Shoe Model';
  const splitName = extractBaseSkuAndSize(rawProdName);
  const modelName = baseNameOverride || splitName.baseSku || rawProdName;

  const p = first?.products || {
    id: productId,
    name: modelName,
    brand: 'Generic',
    category: 'General',
    gender: '',
  };

  const detectedColour = colourOverride || first?.colour?.trim() || 'All / Default';
  const groupKey = `${modelName.toUpperCase()}__${detectedColour}`;

  // Build lines deduplicated by normalized size so all sizes of the base SKU sit inside one card
  const bySize = new Map<string, CountedVariantLine>();
  for (const v of variants) {
    const splitSku = extractBaseSkuAndSize(v.sku || v.barcode || '');
    const rawSz = (v.size && v.size.toString().trim()) ? v.size.toString().trim() : (splitSku.size || '-');
    const normSz = normalizeSizeKey(rawSz);
    const sysQty = app.getStock(v.id, locationId);

    const existing = bySize.get(normSz);
    if (existing) {
      existing.systemStock += sysQty;
    } else {
      bySize.set(normSz, {
        variantId: v.id,
        productId: v.product_id || productId,
        sku: v.sku || `${modelName}${normSz}`,
        barcode: v.barcode || v.sku || '',
        size: normSz,
        displaySize: normSz,
        colour: detectedColour === 'All / Default' ? (v.colour || '') : detectedColour,
        sellingPrice: Number(v.selling_price) || 0,
        costPrice: Number(v.cost_price) || 0,
        systemStock: sysQty,
        countedQty: 0,
        isCustom: false,
      });
    }
  }

  const lines = sortLinesBySize(Array.from(bySize.values()));

  return {
    groupKey,
    productId,
    name: modelName,
    colour: detectedColour,
    brand: p.brand || 'Generic',
    category: p.category || 'General',
    gender: p.gender || '',
    sellingPrice: Number(first?.selling_price) || 0,
    costPrice: Number(first?.cost_price) || 0,
    isCustomModel: false,
    lines,
  };
}

/**
 * Clones an existing model group for a new Colour (e.g. Black -> Brown)
 * with fresh 0 counted quantities across all sizes.
 */
export function cloneGroupForNewColour(source: CountedModelGroup, newColour: string): CountedModelGroup {
  const cleanCol = newColour.trim() || 'Brown';
  const suffixId = `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
  const newGroupKey = `${source.name.toUpperCase()}__${cleanCol}__${suffixId}`;

  const baseLines = source.lines.map((l) => ({
    ...l,
    variantId: `col_${newGroupKey}_${l.size}`,
    colour: cleanCol,
    countedQty: 0,
    isCustom: true,
  }));

  return {
    ...source,
    groupKey: newGroupKey,
    colour: cleanCol,
    lines: sortLinesBySize(baseLines),
  };
}

function csvCell(val: string | number | null | undefined): string {
  const s = (val ?? '').toString().replace(/"/g, '""');
  return `"${s}"`;
}

function triggerCsvDownload(csvContent: string, filename: string) {
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
 * Leaves zero-counted rows out (or blank instead of 0) so the sheet stays clean.
 */
export function exportDetailedStockCountCSV(
  groups: CountedModelGroup[],
  locationName: string,
  mode: CountMode,
  sessionTitle: string,
  onlyNonZero = true,
) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const headers = [
    'Shop / Branch',
    'Count Date',
    'Session / Note',
    'Model SKU / Code',
    'Colour',
    'Brand',
    'Category',
    'Full Barcode / SKU',
    'Size',
    'Selling Price (Rs)',
    'System Stock',
    mode === 'audit' ? 'Counted Qty' : 'Added Qty (+)',
    'Variance / Diff',
    'Counted Value (Rs)',
  ];

  const rows: string[] = [headers.map(csvCell).join(',')];

  for (const g of groups) {
    const colLabel = g.colour && g.colour !== 'All / Default' ? g.colour : '';
    for (const l of sortLinesBySize(g.lines)) {
      if (onlyNonZero && l.countedQty <= 0) continue;
      const diff = mode === 'audit' ? l.countedQty - l.systemStock : l.countedQty;
      const retailVal = l.countedQty * (l.sellingPrice || g.sellingPrice || 0);

      rows.push(
        [
          locationName,
          dateStr,
          sessionTitle || 'Shop Stock Count',
          g.name,
          colLabel || l.colour || '',
          g.brand,
          g.category,
          l.barcode || l.sku,
          normalizeSizeKey(l.size),
          g.sellingPrice > 0 ? g.sellingPrice.toFixed(2) : '',
          l.systemStock > 0 ? l.systemStock : '',
          l.countedQty > 0 ? l.countedQty : '',
          diff !== 0 ? (diff > 0 ? `+${diff}` : `${diff}`) : '',
          retailVal > 0 ? retailVal.toFixed(2) : '',
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
 * 2. Shoe Size-Matrix Excel CSV Export (Sizes 1 to 50 as columns!)
 * IMPORTANT: Sizes with 0 stock are left COMPLETELY BLANK ("") — never 0!
 */
export function exportMatrixStockCountCSV(
  groups: CountedModelGroup[],
  locationName: string,
  mode: CountMode,
  sessionTitle: string,
) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const allSizes = EXCEL_SIZES_1_TO_50; // ["1", "2", "3", ..., "50"]

  const headers = [
    'Shop / Branch',
    'Date',
    'Model SKU / Code',
    'Colour',
    'Brand',
    'Category',
    'Selling Price (Rs)',
    ...allSizes.map((s) => `Sz ${s}`),
    'Total Counted Pairs',
    'Total Value (Rs)',
  ];

  const rows: string[] = [headers.map(csvCell).join(',')];

  for (const g of groups) {
    const modelCounted = g.lines.reduce((s, l) => s + (Number(l.countedQty) || 0), 0);
    if (modelCounted <= 0) continue;

    const colLabel = g.colour && g.colour !== 'All / Default' ? g.colour : '';

    // Map each size 1..50 -> if sum > 0 put sum, else put "" (EMPTY, never 0!)
    const sizeCells = allSizes.map((sz) => {
      const matching = g.lines.filter((l) => normalizeSizeKey(l.size) === sz);
      const sum = matching.reduce((s, l) => s + (Number(l.countedQty) || 0), 0);
      return sum > 0 ? sum : '';
    });

    const totalVal = g.lines.reduce((s, l) => s + (Number(l.countedQty) || 0) * (l.sellingPrice || g.sellingPrice || 0), 0);

    rows.push(
      [
        locationName,
        dateStr,
        g.name,
        colLabel,
        g.brand,
        g.category,
        g.sellingPrice > 0 ? g.sellingPrice.toFixed(2) : '',
        ...sizeCells,
        modelCounted,
        totalVal > 0 ? totalVal.toFixed(2) : '',
      ]
        .map(csvCell)
        .join(','),
    );
  }

  const cleanShop = (locationName || 'Shop').replace(/[^a-zA-Z0-9_-]/g, '_');
  triggerCsvDownload(rows.join('\r\n'), `FashionFeet_StockCount_Matrix_Sz1-50_${cleanShop}_${dateStr}.csv`);
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
    const activeLines = sortLinesBySize(g.lines).filter((l) => l.countedQty > 0);
    if (activeLines.length === 0) continue;
    totalModels++;
    const gSys = g.lines.reduce((s, l) => s + l.systemStock, 0);
    const gCnt = g.lines.reduce((s, l) => s + l.countedQty, 0);
    const gVal = g.lines.reduce((s, l) => s + l.countedQty * (l.sellingPrice || g.sellingPrice || 0), 0);
    totalSys += gSys;
    totalCounted += gCnt;
    totalValue += gVal;

    const colTag = g.colour && g.colour !== 'All / Default' ? ` [${g.colour}]` : '';
    const sizeBreakdown = activeLines
      .map((l) => `Sz ${l.size}: *${l.countedQty}*`)
      .join(' | ');

    linesOut.push(`• *${g.name}*${colTag} — *${gCnt} prs*`);
    if (sizeBreakdown) linesOut.push(`   ${sizeBreakdown}`);
  }

  linesOut.push(`--------------------------------`);
  linesOut.push(`Models Counted: *${totalModels}*`);
  linesOut.push(`Total Counted Pairs: *${totalCounted}*`);
  if (totalValue > 0) linesOut.push(`Counted Value: *${fmtMoney(totalValue)}*`);

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
    if (gCnt === 0) continue;
    totalModels++;
    const gVal = g.lines.reduce((s, l) => s + l.countedQty * (l.sellingPrice || g.sellingPrice || 0), 0);
    totalSys += gSys;
    totalCounted += gCnt;
    totalValue += gVal;
    const diff = mode === 'audit' ? gCnt - gSys : gCnt;
    const colLabel = g.colour && g.colour !== 'All / Default' ? ` • Colour: <b>${g.colour}</b>` : '';

    const sizesHtml = sortLinesBySize(g.lines)
      .filter((l) => l.countedQty > 0)
      .map((l) => {
        return `<span style="display:inline-block;border:1px solid #d4d4d8;background:#fafafa;border-radius:4px;padding:2px 6px;margin:2px;font-size:11px;font-family:monospace;">
          <b>Sz ${l.size}:</b> ${l.countedQty}
        </span>`;
      })
      .join('');

    rowsHtml += `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e4e4e7;font-weight:700;">
          ${g.name}
          <div style="font-size:11px;font-weight:400;color:#71717a;">${g.brand} • ${g.category}${colLabel}</div>
        </td>
        <td style="padding:8px;border-bottom:1px solid #e4e4e7;">${sizesHtml || '-'}</td>
        <td style="padding:8px;border-bottom:1px solid #e4e4e7;text-align:right;font-family:monospace;font-weight:700;font-size:14px;">${gCnt}</td>
        <td style="padding:8px;border-bottom:1px solid #e4e4e7;text-align:right;font-family:monospace;">${gVal > 0 ? fmtMoney(gVal) : '-'}</td>
      </tr>
    `;
  }

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
    <div class="kpi"><div class="kpi-label">Total Counted Pairs</div><div class="kpi-val">${totalCounted}</div></div>
    <div class="kpi"><div class="kpi-label">Counted Retail Value</div><div class="kpi-val">${fmtMoney(totalValue)}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Shoe Model & Colour</th>
        <th>Counted Sizes</th>
        <th style="text-align:right;">Total Pairs</th>
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
