import { app } from '../../lib/app.svelte';
import { SoundFx } from '../../lib/sound';
import type { CartLine } from '../../lib/types';
import {
  buildPOHtml,
  buildReorderCsv,
  buildSheetItem,
  buildStockCsv,
  buildStockPrintHtml,
  buildStockWhatsApp,
  buildWhatsAppMessage,
  downloadCsv,
  getMatchingModels,
  getVariantStock,
  normalizeSizeInput,
  reorderCsvFilename,
  sortVariantsBySize,
  stockBranchDisplay,
  type SheetItem,
} from './logic';
import { getShoeDisplaySize } from '../../lib/app.svelte';

const DEFAULT_LOCATION_ID = 'b9730905-c070-4ee8-960e-74d2fef1592b'; // Shoe Gallery

/** Module-level state: survives tab switches (legacy kept it in global state.reorder). */
class ReorderState {
  locId = $state(DEFAULT_LOCATION_ID);
  brand = $state('ALL');
  cat = $state('ALL');
  status = $state('ALL');
  query = $state('');
  sheet = $state<SheetItem[]>([]);
  notes = $state('');
  locResolved = false;

  /** Legacy select fell back to "ALL" when the default branch was absent. */
  resolveLocation() {
    if (this.locResolved || app.locations.length === 0) return;
    this.locResolved = true;
    if (this.locId !== 'ALL' && !app.locations.some((l) => l.id === this.locId)) this.locId = 'ALL';
  }

  find(productId: string) {
    return this.sheet.find((i) => i.productId === productId);
  }
  has(productId: string) {
    return this.sheet.some((i) => i.productId === productId);
  }

  refreshSheetStock() {
    for (const item of this.sheet) for (const v of item.variants) v.currentStock = getVariantStock(v.variantId, this.locId);
  }

  setLocation(id: string) {
    this.locId = id;
    this.refreshSheetStock();
  }

  addCode(productId: string) {
    if (this.has(productId)) {
      app.toast('Already in Reorder Sheet. Adjust sizes on the right panel.', 'info');
      this.scrollTo(productId);
      return;
    }
    const item = buildSheetItem(productId, this.locId);
    if (!item) return;
    this.sheet.push(item);
    SoundFx.scan();
    app.toast(`Added ${item.brand} ${item.name} to Reorder Form!`, 'success');
    setTimeout(() => this.scrollTo(productId), 100);
  }
  scrollTo(productId: string) {
    document.getElementById(`sheetItem_${productId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  removeCode(productId: string) {
    this.sheet = this.sheet.filter((i) => i.productId !== productId);
    app.toast('Model removed from Reorder Sheet.', 'info');
  }
  toggleCode(productId: string) {
    if (this.has(productId)) this.removeCode(productId);
    else this.addCode(productId);
  }
  clearSheet() {
    if (this.sheet.length === 0) return;
    if (confirm('Clear all items in this Reorder Sheet?')) {
      this.sheet = [];
      app.toast('Reorder Sheet cleared.', 'info');
    }
  }

  setQty(productId: string, variantId: string, val: number | string) {
    const v = this.find(productId)?.variants.find((x) => x.variantId === variantId);
    if (v) v.orderQty = Math.max(0, parseInt(String(val)) || 0);
  }
  stepQty(productId: string, variantId: string, delta: number) {
    const v = this.find(productId)?.variants.find((x) => x.variantId === variantId);
    if (v) v.orderQty = Math.max(0, (v.orderQty || 0) + delta);
  }
  fillZeroStock(productId: string, targetQty = 3) {
    const item = this.find(productId);
    if (!item) return;
    let n = 0;
    item.variants.forEach((v) => {
      if (v.currentStock === 0) {
        v.orderQty = targetQty;
        n++;
      }
    });
    app.toast(`Set ${targetQty} pairs for ${n} out-of-stock size(s)!`, 'success');
  }
  addOneAll(productId: string) {
    const item = this.find(productId);
    if (!item) return;
    item.variants.forEach((v) => (v.orderQty = (v.orderQty || 0) + 1));
    app.toast('Added +1 pair to all sizes', 'info');
  }
  fillCurrentStock(productId: string) {
    const item = this.find(productId);
    if (!item) return;
    let total = 0;
    item.variants.forEach((v) => {
      v.orderQty = Math.max(0, v.currentStock || 0);
      total += v.orderQty;
    });
    app.toast(`Copied current stock (${total} pairs) as order quantity!`, 'success');
  }
  zeroAll(productId: string) {
    const item = this.find(productId);
    if (!item) return;
    item.variants.forEach((v) => (v.orderQty = 0));
    app.toast('Reset order quantities to 0', 'info');
  }
  fillAllCurrentStock() {
    if (this.sheet.length === 0) return;
    let total = 0;
    for (const item of this.sheet)
      item.variants.forEach((v) => {
        v.orderQty = Math.max(0, v.currentStock || 0);
        total += v.orderQty;
      });
    app.toast(`Matched current stock (${total} pairs) across all models in sheet!`, 'success');
  }

  /** Returns true when a size was added/merged (modal should close). */
  addCustomSize(productId: string, sizeInput: string | number, qtyInput: string | number = 3): boolean {
    const item = this.find(productId);
    if (!item) return false;
    const cleanSize = normalizeSizeInput(sizeInput, item);
    if (!cleanSize) {
      app.toast('Please enter a valid shoe size.', 'warning');
      return false;
    }
    const qty = Math.max(1, parseInt(String(qtyInput)) || 3);
    const displaySize = getShoeDisplaySize(cleanSize, item);
    const existing = item.variants.find((v) => {
      const vSize = (v.size || '').toString().trim().toUpperCase();
      const vDisp = (v.displaySize || '').toString().trim().toUpperCase();
      return vSize === cleanSize.toUpperCase() || vDisp === displaySize.toUpperCase();
    });
    if (existing) {
      existing.orderQty = (existing.orderQty || 0) + qty;
      app.toast(
        `Size ${existing.displaySize || existing.size} already exists! Increased order qty by +${qty} (Total: ${existing.orderQty}).`,
        'info',
      );
      return true;
    }
    item.variants.push({
      variantId: `custom_${productId}_${cleanSize}_${Date.now()}`,
      sku: `${item.name}-${cleanSize}`,
      size: cleanSize,
      displaySize,
      colour: item.variants[0]?.colour || '-',
      currentStock: 0,
      costPrice: item.costPrice || 0,
      orderQty: qty,
      isCustom: true,
    });
    item.variants = sortVariantsBySize(item.variants);
    SoundFx.scan();
    app.toast(`Added Size ${displaySize} (${qty} pairs) to ${item.name}!`, 'success');
    return true;
  }
  removeCustomSize(productId: string, variantId: string) {
    const item = this.find(productId);
    if (!item) return;
    const idx = item.variants.findIndex((v) => v.variantId === variantId);
    if (idx !== -1) {
      const removed = item.variants.splice(idx, 1)[0];
      app.toast(`Removed Size ${removed.displaySize || removed.size} from order.`, 'info');
    }
  }

  // ---- hand-off to Transfer tab ----
  sendToTransfer(productId: string) {
    const variants = app.productsMap.get(productId);
    if (!variants || variants.length === 0) return;
    const locId = this.locId !== 'ALL' ? this.locId : app.fromId || app.locations[0]?.id || '';
    const branchName = app.locations.find((l) => l.id === locId)?.name ?? 'Dispatch Branch';
    if (this.locId !== 'ALL') app.fromId = locId;

    let addedCount = 0;
    let addedPairs = 0;
    for (const v of variants) {
      const available = app.getStock(v.id, locId);
      if (available > 0) {
        const idx = app.cart.findIndex((c) => c.variant.id === v.id);
        if (idx >= 0) {
          app.cart[idx].qty += available;
          app.cart[idx].availableStock = available;
        } else {
          const line: CartLine = { variant: v, qty: available, availableStock: available };
          app.cart.unshift(line);
        }
        addedCount++;
        addedPairs += available;
      }
    }
    if (addedCount === 0) {
      app.toast(`No stock currently available for this model at ${branchName}!`, 'warning');
      SoundFx.warning();
      return;
    }
    SoundFx.success();
    app.toast(`Added ${addedPairs} pairs (${addedCount} sizes) to Transfer Batch!`, 'success');
    app.tab = 'transfer';
  }

  // ---- outputs ----
  private orderMsg() {
    const data = buildWhatsAppMessage(this.sheet, this.locId, this.notes);
    if (!data) app.toast('Please enter order quantities (> 0) for at least one size.', 'warning');
    return data;
  }
  async copyWhatsAppOrder() {
    const data = this.orderMsg();
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.text);
      app.toast(`WhatsApp Order copied to clipboard! (${data.totalPairs} Pairs)`, 'success');
    } catch (err) {
      console.error('Clipboard error:', err);
      app.toast('Failed to copy. Please select and copy manually.', 'error');
    }
  }
  directWhatsAppOrder() {
    const data = this.orderMsg();
    if (!data) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(data.text)}`, '_blank');
  }
  printPO() {
    if (!this.orderMsg()) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(buildPOHtml(this.sheet, this.locId, this.notes));
    w.document.close();
  }
  exportCSV() {
    if (this.sheet.length === 0) {
      app.toast('Reorder Sheet is empty.', 'warning');
      return;
    }
    const csv = buildReorderCsv(this.sheet);
    if (!csv) {
      app.toast('Please enter quantities (> 0) to export.', 'warning');
      return;
    }
    downloadCsv(csv, reorderCsvFilename());
    app.toast('Reorder Sheet exported to CSV!', 'success');
  }

  // ---- current stock outputs (explicit params, default to page filters) ----
  private models(locId: string, brand: string, cat: string, status: string) {
    const { matchingModels } = getMatchingModels({ locId, brand, cat, status, query: '' });
    if (matchingModels.length === 0) {
      app.toast(`No shoe models found for ${stockBranchDisplay(locId)} with current filters.`, 'warning');
      return null;
    }
    return matchingModels;
  }
  exportStockCSV(locId = this.locId, brand = this.brand, cat = this.cat, status = this.status) {
    const m = this.models(locId, brand, cat, status);
    if (!m) return;
    const r = buildStockCsv(m, locId);
    downloadCsv(r.csv, r.filename);
    app.toast(`Stock CSV for ${r.branchDisplay} exported! (${r.grandTotalPairs} pairs)`, 'success');
  }
  printStockSheet(locId = this.locId, brand = this.brand, cat = this.cat, status = this.status) {
    const m = this.models(locId, brand, cat, status);
    if (!m) return;
    const w = window.open('', '_blank', 'width=950,height=750');
    if (!w) {
      alert('Please allow popups to print Current Stock Sheet.');
      return;
    }
    w.document.write(buildStockPrintHtml(m, locId, brand, cat, status));
    w.document.close();
  }
  async copyStockWhatsApp(locId = this.locId, brand = this.brand, cat = this.cat, status = this.status) {
    const m = this.models(locId, brand, cat, status);
    if (!m) return;
    const r = buildStockWhatsApp(m, locId, brand, cat);
    try {
      await navigator.clipboard.writeText(r.text);
      SoundFx.success();
      app.toast(`Current Stock for ${r.branchName} copied for WhatsApp! (${r.totalPairs} pairs)`, 'success');
    } catch {
      prompt('Copy this stock summary:', r.text);
    }
  }
}

export const reorder = new ReorderState();
