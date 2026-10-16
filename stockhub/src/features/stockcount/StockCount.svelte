<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ClipboardCheck, Store, Building2, ChevronDown, Check, Search, ScanLine, Camera, Zap, Plus, Minus,
    Trash2, FileSpreadsheet, Table, Printer, MessageCircle, Database, RotateCcw, Sparkles, PackagePlus,
    X, CheckCircle2, AlertTriangle, Loader2, Copy, Layers, ArrowUpDown,
  } from 'lucide-svelte';
  import { app, getShoeDisplaySize, fmtMoney } from '../../lib/app.svelte';
  import { restGet, restWrite } from '../../lib/api';
  import { SoundFx } from '../../lib/sound';
  import type { Variant, Location } from '../../lib/types';
  import CameraScanner from '../transfer/CameraScanner.svelte';
  import {
    type CountMode,
    type CountedModelGroup,
    type CountedVariantLine,
    loadStockCountDraft,
    saveStockCountDraft,
    clearStockCountDraft,
    sortLinesBySize,
    buildGroupFromCatalogProduct,
    exportDetailedStockCountCSV,
    exportMatrixStockCountCSV,
    buildStockCountWhatsApp,
    printStockCountSheet,
  } from './logic';

  // ---------------- state ----------------
  let locationId = $state('');
  let mode = $state<CountMode>('audit');
  let sessionTitle = $state('');
  let notes = $state('');
  let groups = $state<CountedModelGroup[]>([]);

  // UI controls
  let locDropdownOpen = $state(false);
  let query = $state('');
  let debounced = $state('');
  let showResults = $state(false);
  let cameraOpen = $state(false);
  let sheetFilter = $state<'ALL' | 'COUNTED' | 'VARIANCE' | 'MATCHED'>('ALL');
  let sheetSearch = $state('');
  let activeProductId = $state<string | null>(null);
  let lastScannedVariantId = $state<string | null>(null);

  // Manual / unlisted model modal
  let manualModalOpen = $state(false);
  let manualName = $state('');
  let manualBrand = $state('Generic');
  let manualCategory = $state('General');
  let manualPrice = $state<number>(0);
  let manualSizes = $state<Record<string, number>>({
    '36': 0, '37': 0, '38': 0, '39': 0, '40': 0, '41': 0, '42': 0, '43': 0, '44': 0, '45': 0,
  });

  // Custom size modal for an existing model group
  let customSizeGroupIdx = $state<number | null>(null);
  let customSizeInput = $state('');
  let customSizeQty = $state(1);

  // Confirm DB sync modal
  let confirmSyncOpen = $state(false);
  let syncingDb = $state(false);

  let searchInput: HTMLInputElement | undefined = $state();
  let debounceTimer: ReturnType<typeof setTimeout>;
  let draftLoaded = $state(false);

  // ---------------- lifecycle & persistence ----------------
  onMount(() => {
    const saved = loadStockCountDraft();
    if (saved) {
      locationId = saved.locationId || app.fromId || app.locations[0]?.id || '';
      mode = saved.mode || 'audit';
      sessionTitle = saved.sessionTitle || '';
      notes = saved.notes || '';
      groups = saved.groups || [];
    } else {
      locationId = app.fromId || app.locations[0]?.id || '';
    }
    draftLoaded = true;
  });

  // Ensure locationId defaults once locations load
  $effect(() => {
    if (!locationId && app.locations.length > 0) {
      locationId = app.fromId || app.locations[0].id;
    }
  });

  // Refresh systemStock values whenever locationId or app.syncVersion changes
  $effect(() => {
    const loc = locationId;
    const _ver = app.syncVersion;
    if (!loc || !draftLoaded) return;
    for (const g of groups) {
      if (g.isCustomModel) continue;
      for (const l of g.lines) {
        if (!l.isCustom) {
          l.systemStock = app.getStock(l.variantId, loc);
        }
      }
    }
  });

  // Auto-save draft on any change
  $effect(() => {
    if (!draftLoaded) return;
    saveStockCountDraft({
      locationId,
      mode,
      sessionTitle,
      notes,
      groups,
      updatedAt: new Date().toISOString(),
    });
  });

  // ---------------- derived stats ----------------
  const selectedLoc = $derived(app.locations.find((l) => l.id === locationId));
  const locName = $derived(selectedLoc?.name || 'Select Shop');

  const stats = $derived.by(() => {
    let modelsCount = groups.length;
    let countedModels = 0;
    let totalSys = 0;
    let totalCounted = 0;
    let totalValue = 0;
    let varianceLines = 0;

    for (const g of groups) {
      const gCnt = g.lines.reduce((s, l) => s + (Number(l.countedQty) || 0), 0);
      if (gCnt > 0) countedModels++;
      for (const l of g.lines) {
        const sys = Number(l.systemStock) || 0;
        const cnt = Number(l.countedQty) || 0;
        totalSys += sys;
        totalCounted += cnt;
        totalValue += cnt * (Number(l.sellingPrice || g.sellingPrice) || 0);
        if (cnt !== sys) varianceLines++;
      }
    }

    const netDiff = mode === 'audit' ? totalCounted - totalSys : totalCounted;
    return { modelsCount, countedModels, totalSys, totalCounted, totalValue, netDiff, varianceLines };
  });

  // ---------------- catalog search & barcode scan ----------------
  interface ModelSearchHit {
    productId: string;
    name: string;
    brand: string;
    category: string;
    sellingPrice: number;
    shopStock: number;
    variants: Variant[];
    matchedVariant?: Variant;
  }

  function searchModels(q0: string): ModelSearchHit[] {
    if (!q0 || q0.trim().length < 1) return [];
    const q = q0.trim().toUpperCase();
    const hits: ModelSearchHit[] = [];

    for (const [productId, variants] of app.productsMap.entries()) {
      if (!variants || variants.length === 0) continue;
      const first = variants[0];
      const p = first.products;
      const name = p?.name || first.sku || 'Shoe Model';
      const brand = p?.brand || 'Generic';
      const category = p?.category || 'General';

      const exactVariant = variants.find(
        (v) =>
          (v.barcode && v.barcode.toUpperCase() === q) ||
          (v.sku && v.sku.toUpperCase() === q),
      );
      const partialVariant = variants.find(
        (v) =>
          (v.barcode && v.barcode.toUpperCase().includes(q)) ||
          (v.sku && v.sku.toUpperCase().includes(q)),
      );
      const nameMatch = name.toUpperCase().includes(q);
      const brandMatch = brand.toUpperCase().includes(q);
      const catMatch = category.toUpperCase().includes(q);

      if (!exactVariant && !partialVariant && !nameMatch && !brandMatch && !catMatch) continue;

      let shopStock = 0;
      for (const v of variants) shopStock += app.getStock(v.id, locationId);

      hits.push({
        productId,
        name,
        brand,
        category,
        sellingPrice: Number(first.selling_price) || 0,
        shopStock,
        variants,
        matchedVariant: exactVariant || partialVariant,
      });
    }

    hits.sort((a, b) => {
      const aEx = a.matchedVariant && ((a.matchedVariant.barcode?.toUpperCase() === q) || (a.matchedVariant.sku?.toUpperCase() === q));
      const bEx = b.matchedVariant && ((b.matchedVariant.barcode?.toUpperCase() === q) || (b.matchedVariant.sku?.toUpperCase() === q));
      if (aEx && !bEx) return -1;
      if (!aEx && bEx) return 1;
      if (a.name.toUpperCase().startsWith(q) && !b.name.toUpperCase().startsWith(q)) return -1;
      if (!a.name.toUpperCase().startsWith(q) && b.name.toUpperCase().startsWith(q)) return 1;
      return b.shopStock - a.shopStock;
    });

    return hits.slice(0, 20);
  }

  const searchResults = $derived(searchModels(debounced));

  function onSearchInput(val: string) {
    query = val;
    clearTimeout(debounceTimer);
    if (!val.trim()) {
      debounced = '';
      showResults = false;
      return;
    }
    debounceTimer = setTimeout(() => {
      debounced = val;
      showResults = true;
    }, 80);
  }

  function ensureModelGroup(productId: string, variants: Variant[]): CountedModelGroup {
    const existingIdx = groups.findIndex((g) => g.productId === productId);
    if (existingIdx !== -1) {
      const grp = groups[existingIdx];
      // Move to top of sheet so user immediately sees it
      if (existingIdx > 0) {
        groups.splice(existingIdx, 1);
        groups.unshift(grp);
      }
      return groups[0];
    }
    const newGroup = buildGroupFromCatalogProduct(productId, variants, locationId);
    groups.unshift(newGroup);
    return groups[0];
  }

  function scanOrAddVariant(v: Variant, incrementQty = 1) {
    const pid = v.product_id || v.products?.id || v.id;
    const allVars = app.productsMap.get(pid) || [v];
    const group = ensureModelGroup(pid, allVars);
    const line = group.lines.find((l) => l.variantId === v.id);
    if (line) {
      line.countedQty = Math.max(0, (Number(line.countedQty) || 0) + incrementQty);
      line.lastScannedAt = Date.now();
    }
    activeProductId = pid;
    lastScannedVariantId = v.id;
    SoundFx.scan();
    setTimeout(() => {
      if (lastScannedVariantId === v.id) lastScannedVariantId = null;
    }, 1200);
  }

  function selectModelFromSearch(hit: ModelSearchHit) {
    const group = ensureModelGroup(hit.productId, hit.variants);
    activeProductId = group.productId;
    if (hit.matchedVariant && app.autoScan) {
      scanOrAddVariant(hit.matchedVariant, 1);
      app.toast(`+1 Counted: ${hit.name} (Sz ${getShoeDisplaySize(hit.matchedVariant.size, hit.matchedVariant.products)})`, 'success');
    } else {
      SoundFx.scan();
      app.toast(`Added ${hit.name} (${group.lines.length} sizes) to Stock Sheet`, 'info');
    }
    query = '';
    debounced = '';
    showResults = false;
  }

  function flashVariant(pid: string, vid: string) {
    activeProductId = pid;
    lastScannedVariantId = vid;
    SoundFx.scan();
    setTimeout(() => {
      if (lastScannedVariantId === vid) lastScannedVariantId = null;
    }, 1200);
  }

  /**
   * Checks if a scanned barcode/SKU already exists in our current Stock Count Sheet (including unlisted items).
   * If found, increments its countedQty by +1 and moves its group to the top.
   */
  function tryIncrementExistingInSheet(q: string): boolean {
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const line = g.lines.find(
        (l) =>
          (l.barcode && l.barcode.toUpperCase() === q) ||
          (l.sku && l.sku.toUpperCase() === q),
      );
      if (line) {
        line.countedQty = Math.max(0, (Number(line.countedQty) || 0) + 1);
        line.lastScannedAt = Date.now();
        if (i > 0) {
          groups.splice(i, 1);
          groups.unshift(g);
        }
        flashVariant(g.productId, line.variantId);
        app.toast(
          `+1 Counted: ${g.name}${line.displaySize && line.displaySize !== '-' ? ' • Sz ' + line.displaySize : ''} (Total: ${line.countedQty})`,
          'success',
        );
        return true;
      }
    }
    return false;
  }

  /**
   * Automatically adds or increments a barcode/code that is NOT in the system catalog.
   */
  function countUnlistedBarcode(rawCode: string) {
    const q = rawCode.trim().toUpperCase();
    if (!q) return;

    // 1. If already scanned in sheet, increment +1
    if (tryIncrementExistingInSheet(q)) return;

    // 2. Check if barcode has a pattern like MODEL-41 or MODEL_42
    const szMatch = q.match(/^(.+?)[-_\/](\d{1,2}(?:\.5)?)$/);
    const modelName = szMatch ? szMatch[1].trim() : q;
    const detectedSize = szMatch ? szMatch[2] : '-';

    // Check if an unlisted group with this modelName already exists
    const existingGrpIdx = groups.findIndex(
      (g) => g.isCustomModel && g.name.toUpperCase() === modelName,
    );

    if (existingGrpIdx !== -1) {
      const grp = groups[existingGrpIdx];
      let line = grp.lines.find((l) => l.size.toUpperCase() === detectedSize || l.barcode.toUpperCase() === q);
      if (line) {
        line.countedQty = Math.max(0, (Number(line.countedQty) || 0) + 1);
      } else {
        const newVid = `unlisted_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newLine: CountedVariantLine = {
          variantId: newVid,
          productId: grp.productId,
          sku: q,
          barcode: q,
          size: detectedSize,
          displaySize: detectedSize === '-' ? '-' : getShoeDisplaySize(detectedSize, { name: grp.name }),
          colour: '',
          sellingPrice: grp.sellingPrice,
          costPrice: 0,
          systemStock: 0,
          countedQty: 1,
          isCustom: true,
          lastScannedAt: Date.now(),
        };
        grp.lines = sortLinesBySize([...grp.lines, newLine]);
        line = newLine;
      }
      if (existingGrpIdx > 0) {
        groups.splice(existingGrpIdx, 1);
        groups.unshift(grp);
      }
      flashVariant(grp.productId, line.variantId);
      app.toast(`+1 Unlisted Barcode Counted: ${q} (Total: ${line.countedQty})`, 'success');
      return;
    }

    // 3. Create a brand new Unlisted Scanned Group at top of sheet
    const pid = `unlisted_grp_${Date.now()}`;
    const vid = `unlisted_var_${Date.now()}`;
    const newGroup: CountedModelGroup = {
      productId: pid,
      name: modelName,
      brand: 'Unlisted',
      category: 'Scanned Barcode',
      gender: '',
      sellingPrice: 0,
      costPrice: 0,
      isCustomModel: true,
      lines: [
        {
          variantId: vid,
          productId: pid,
          sku: q,
          barcode: q,
          size: detectedSize,
          displaySize: detectedSize === '-' ? '-' : getShoeDisplaySize(detectedSize, { name: modelName }),
          colour: '',
          sellingPrice: 0,
          costPrice: 0,
          systemStock: 0,
          countedQty: 1,
          isCustom: true,
          lastScannedAt: Date.now(),
        },
      ],
    };

    groups.unshift(newGroup);
    flashVariant(pid, vid);
    app.toast(`New Barcode "${q}" added & counted (+1)!`, 'success');
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      showResults = false;
      return;
    }
    if (e.key !== 'Enter') return;
    const q = query.trim().toUpperCase();
    if (!q) return;
    e.preventDefault();

    // 1. Check if this exact barcode/SKU is already in our sheet (e.g. previously scanned unlisted barcode)
    if (tryIncrementExistingInSheet(q)) {
      query = '';
      debounced = '';
      showResults = false;
      return;
    }

    // 2. Check exact barcode or SKU match across system catalog
    const exactVar = app.catalog.find(
      (v) => (v.barcode && v.barcode.toUpperCase() === q) || (v.sku && v.sku.toUpperCase() === q),
    );
    if (exactVar) {
      scanOrAddVariant(exactVar, 1);
      app.toast(
        `Scanned +1: ${exactVar.products?.name || exactVar.sku} • Sz ${getShoeDisplaySize(exactVar.size, exactVar.products)}`,
        'success',
      );
      query = '';
      debounced = '';
      showResults = false;
      return;
    }

    // 3. Check partial catalog model match
    const hits = searchModels(q);
    if (hits.length > 0) {
      selectModelFromSearch(hits[0]);
      return;
    }

    // 4. Not in system catalog -> automatically count as Unlisted Barcode!
    countUnlistedBarcode(q);
    query = '';
    debounced = '';
    showResults = false;
  }

  function handleCameraScan(code: string) {
    const q = code.trim().toUpperCase();
    if (!q) return;

    // 1. Check if already in sheet
    if (tryIncrementExistingInSheet(q)) return;

    // 2. Check exact match in system catalog
    const exactVar = app.catalog.find(
      (v) => (v.barcode && v.barcode.toUpperCase() === q) || (v.sku && v.sku.toUpperCase() === q),
    );
    if (exactVar) {
      scanOrAddVariant(exactVar, 1);
      return;
    }

    // 3. Automatically count as Unlisted Barcode!
    countUnlistedBarcode(q);
  }

  // ---------------- bulk / helper actions ----------------
  function loadAllShopStockIntoSheet() {
    if (!locationId) {
      app.toast('Please select a shop branch first.', 'warning');
      return;
    }
    let addedCount = 0;
    for (const [productId, variants] of app.productsMap.entries()) {
      const hasStock = variants.some((v) => app.getStock(v.id, locationId) > 0);
      if (!hasStock) continue;
      if (groups.some((g) => g.productId === productId)) continue;
      groups.push(buildGroupFromCatalogProduct(productId, variants, locationId));
      addedCount++;
    }
    if (addedCount > 0) {
      SoundFx.scan();
      app.toast(`Loaded ${addedCount} in-stock models for ${locName}.`, 'success');
    } else {
      app.toast('All in-stock models for this shop are already in the sheet.', 'info');
    }
  }

  function copySystemToCountedForGroup(g: CountedModelGroup) {
    for (const l of g.lines) {
      l.countedQty = Math.max(0, l.systemStock);
    }
    SoundFx.scan();
  }

  function zeroGroupCounts(g: CountedModelGroup) {
    for (const l of g.lines) {
      l.countedQty = 0;
    }
  }

  function removeGroup(productId: string) {
    groups = groups.filter((g) => g.productId !== productId);
  }

  function clearEntireSheet() {
    if (groups.length === 0) return;
    if (!confirm('Clear all counted shoes from the current Stock Count sheet?')) return;
    groups = [];
    sessionTitle = '';
    notes = '';
    clearStockCountDraft();
    app.toast('Stock count sheet cleared.', 'info');
  }

  // ---------------- manual / unlisted model entry ----------------
  function openManualModal() {
    manualName = query.trim().toUpperCase();
    manualBrand = 'Generic';
    manualCategory = 'General';
    manualPrice = 0;
    manualSizes = { '36': 0, '37': 0, '38': 0, '39': 0, '40': 0, '41': 0, '42': 0, '43': 0, '44': 0, '45': 0 };
    manualModalOpen = true;
  }

  function saveManualModel() {
    const cleanName = manualName.trim();
    if (!cleanName) {
      app.toast('Please enter a Shoe Model Code or Name.', 'warning');
      return;
    }
    const pid = `custom_model_${Date.now()}`;
    const lines: CountedVariantLine[] = Object.entries(manualSizes).map(([sz, qty]) => ({
      variantId: `${pid}_sz_${sz}`,
      productId: pid,
      sku: `${cleanName}-${sz}`,
      barcode: '',
      size: sz,
      displaySize: getShoeDisplaySize(sz, { name: cleanName, brand: manualBrand, category: manualCategory }),
      colour: '',
      sellingPrice: Number(manualPrice) || 0,
      costPrice: 0,
      systemStock: 0,
      countedQty: Math.max(0, Number(qty) || 0),
      isCustom: true,
    }));

    groups.unshift({
      productId: pid,
      name: cleanName,
      brand: manualBrand.trim() || 'Generic',
      category: manualCategory.trim() || 'General',
      gender: '',
      sellingPrice: Number(manualPrice) || 0,
      costPrice: 0,
      isCustomModel: true,
      lines: sortLinesBySize(lines),
    });

    manualModalOpen = false;
    SoundFx.scan();
    app.toast(`Added manual model "${cleanName}" to Stock Sheet.`, 'success');
  }

  // ---------------- custom size for a model ----------------
  function openCustomSizeModal(idx: number) {
    customSizeGroupIdx = idx;
    customSizeInput = '';
    customSizeQty = 1;
  }

  function addCustomSizeToGroup() {
    if (customSizeGroupIdx === null) return;
    const g = groups[customSizeGroupIdx];
    if (!g) return;
    const rawSz = customSizeInput.trim();
    if (!rawSz) {
      app.toast('Enter a size (e.g. 35, 46, 7, 8).', 'warning');
      return;
    }
    const existing = g.lines.find((l) => l.size.toLowerCase() === rawSz.toLowerCase());
    if (existing) {
      existing.countedQty = Math.max(0, existing.countedQty + (Number(customSizeQty) || 0));
    } else {
      g.lines = sortLinesBySize([
        ...g.lines,
        {
          variantId: `custom_${g.productId}_${rawSz}_${Date.now()}`,
          productId: g.productId,
          sku: `${g.name}-${rawSz}`,
          barcode: '',
          size: rawSz,
          displaySize: getShoeDisplaySize(rawSz, { name: g.name, brand: g.brand, category: g.category, gender: g.gender }),
          colour: '',
          sellingPrice: g.sellingPrice,
          costPrice: g.costPrice,
          systemStock: 0,
          countedQty: Math.max(0, Number(customSizeQty) || 0),
          isCustom: true,
        },
      ]);
    }
    customSizeGroupIdx = null;
    SoundFx.scan();
  }

  // ---------------- filtered groups in sheet ----------------
  const visibleGroups = $derived.by(() => {
    const q = sheetSearch.trim().toLowerCase();
    return groups.filter((g) => {
      if (q) {
        const mName = g.name.toLowerCase().includes(q);
        const mBrand = g.brand.toLowerCase().includes(q);
        const mCat = g.category.toLowerCase().includes(q);
        const mSku = g.lines.some((l) => l.sku.toLowerCase().includes(q) || l.barcode.toLowerCase().includes(q));
        if (!mName && !mBrand && !mCat && !mSku) return false;
      }
      const gCnt = g.lines.reduce((s, l) => s + l.countedQty, 0);
      const hasDiff = g.lines.some((l) => l.countedQty !== l.systemStock);
      if (sheetFilter === 'COUNTED') return gCnt > 0;
      if (sheetFilter === 'VARIANCE') return hasDiff;
      if (sheetFilter === 'MATCHED') return !hasDiff && gCnt > 0;
      return true;
    });
  });

  // ---------------- exports & database sync ----------------
  function handleExportDetailedCSV() {
    if (groups.length === 0) {
      app.toast('Add at least one shoe model to export Excel.', 'warning');
      return;
    }
    exportDetailedStockCountCSV(groups, locName, mode, sessionTitle, false);
    app.toast('Detailed Excel (CSV) downloaded!', 'success');
  }

  function handleExportMatrixCSV() {
    if (groups.length === 0) {
      app.toast('Add at least one shoe model to export Size-Matrix Excel.', 'warning');
      return;
    }
    exportMatrixStockCountCSV(groups, locName, mode, sessionTitle);
    app.toast('Size-Matrix Excel (CSV) downloaded!', 'success');
  }

  function handlePrintSheet() {
    if (groups.length === 0) {
      app.toast('Add at least one shoe model to print.', 'warning');
      return;
    }
    printStockCountSheet(groups, locName, mode, sessionTitle, app.currentUser?.name || 'Staff');
  }

  async function handleWhatsAppShare() {
    if (groups.length === 0) {
      app.toast('Add at least one shoe model first.', 'warning');
      return;
    }
    const text = buildStockCountWhatsApp(groups, locName, mode, sessionTitle);
    try {
      await navigator.clipboard.writeText(text);
      app.toast('Stock Count summary copied to clipboard!', 'success');
    } catch {}
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  async function syncCountToDatabase() {
    if (!locationId) {
      app.toast('Please select a valid Shop / Branch.', 'error');
      return;
    }
    syncingDb = true;
    try {
      const nowIso = new Date().toISOString();
      const currentUserId = app.currentUser?.id || 'd0e59b77-058d-45df-b907-fb45d9486b34';
      const refId = `CNT-${Date.now().toString().slice(-6)}`;
      let updatedCount = 0;

      for (const g of groups) {
        if (g.isCustomModel) continue;
        for (const l of g.lines) {
          if (l.isCustom) continue;
          const sys = app.getStock(l.variantId, locationId);
          const targetQty = mode === 'audit' ? Math.max(0, Number(l.countedQty) || 0) : Math.max(0, sys + (Number(l.countedQty) || 0));
          const delta = targetQty - sys;

          // Only hit Supabase if quantity actually changed (or in audit mode when explicitly counted)
          if (delta === 0) continue;

          const existing = await restGet<{ id: string }[]>(
            `stock_levels?variant_id=eq.${l.variantId}&location_id=eq.${locationId}`,
          );
          if (existing && existing.length > 0) {
            await restWrite('PATCH', `stock_levels?id=eq.${existing[0].id}`, {
              quantity: targetQty,
              updated_at: nowIso,
            });
          } else {
            await restWrite('POST', 'stock_levels', {
              variant_id: l.variantId,
              location_id: locationId,
              quantity: targetQty,
              updated_at: nowIso,
            });
          }

          app.stockMap.set(`${l.variantId}_${locationId}`, targetQty);
          l.systemStock = targetQty;
          if (mode === 'add') l.countedQty = 0;
          updatedCount++;

          try {
            await restWrite('POST', 'stock_movements', [
              {
                variant_id: l.variantId,
                from_location: delta < 0 ? locationId : null,
                to_location: delta > 0 ? locationId : null,
                quantity: delta,
                type: mode === 'audit' ? 'stock_audit' : 'stock_in',
                reference_id: refId,
                created_by: currentUserId,
                created_at: nowIso,
              },
            ]);
          } catch (e) {
            console.warn('Stock movement log warning:', e);
          }
        }
      }

      app.syncVersion++;
      SoundFx.success();
      confirmSyncOpen = false;
      app.toast(`Updated ${updatedCount} size variants in ${locName}!`, 'success');
    } catch (e: any) {
      console.error(e);
      app.toast('Error updating database stock: ' + (e?.message || 'Unknown error'), 'error');
    } finally {
      syncingDb = false;
    }
  }
</script>

<svelte:window onclick={() => { locDropdownOpen = false; showResults = false; }} />

<div class="space-y-5">
  <!-- STEP 1: SHOP & MODE CONFIGURATION -->
  <section class="card p-4 sm:p-5">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div class="flex items-center gap-2">
          <span class="chip font-mono text-[10px] uppercase tracking-wider">Shop Stock Take & Excel Hub</span>
          <span class="text-xs text-dim">• Auto-saved to device</span>
        </div>
        <h1 class="mt-1 font-display text-lg font-bold tracking-tight text-fg sm:text-xl">
          Shop Stock Count & Excel Sheet Builder
        </h1>
        <p class="mt-0.5 text-xs text-muted">
          Scan barcodes or enter shoe sizes by model code, then download as an Excel (CSV) sheet or update shop stock.
        </p>
      </div>

      <!-- Top Quick Actions -->
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="btn btn-sm"
          onclick={loadAllShopStockIntoSheet}
          title="Load all models that currently have stock in this shop"
        >
          <Layers class="h-3.5 w-3.5 text-muted" />
          <span>Load Shop Stock</span>
        </button>
        <button
          type="button"
          class="btn btn-sm"
          onclick={openManualModal}
          title="Add a new or unlisted shoe model manually to include in Excel"
        >
          <PackagePlus class="h-3.5 w-3.5 text-muted" />
          <span>+ New / Unlisted Shoe</span>
        </button>
        {#if groups.length > 0}
          <button
            type="button"
            class="btn btn-sm text-bad hover:border-bad/40"
            onclick={clearEntireSheet}
            title="Clear current stock count sheet"
          >
            <RotateCcw class="h-3.5 w-3.5" />
            <span>Reset Sheet</span>
          </button>
        {/if}
      </div>
    </div>

    <!-- Controls Grid: Shop Selector | Counting Mode | Session Note -->
    <div class="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 md:grid-cols-12">
      <!-- 1. Select Shop / Branch -->
      <div class="relative md:col-span-4">
        <span class="label">1. Shop / Branch Location</span>
        <button
          type="button"
          class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-left transition hover:border-line-strong"
          onclick={(e) => { e.stopPropagation(); locDropdownOpen = !locDropdownOpen; }}
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line bg-surface text-fg">
              {#if app.isWarehouse(selectedLoc)}
                <Building2 class="h-4 w-4" />
              {:else}
                <Store class="h-4 w-4" />
              {/if}
            </div>
            <div class="min-w-0">
              <div class="truncate text-xs font-semibold text-fg">{locName}</div>
              <div class="font-mono text-[11px] text-dim">
                System Total: {app.totalStockAt(locationId).toLocaleString()} pairs
              </div>
            </div>
          </div>
          <ChevronDown class="h-4 w-4 shrink-0 text-dim" />
        </button>

        {#if locDropdownOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-xl"
            role="listbox"
            tabindex="-1"
            onclick={(e) => e.stopPropagation()}
          >
            {#each app.locations as loc}
              {@const active = loc.id === locationId}
              <button
                type="button"
                class="flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs transition hover:bg-raised {active ? 'bg-raised font-semibold text-fg' : 'text-muted'}"
                onclick={() => { locationId = loc.id; locDropdownOpen = false; }}
              >
                <div class="flex items-center gap-2 min-w-0">
                  {#if app.isWarehouse(loc)}
                    <Building2 class="h-3.5 w-3.5 shrink-0 text-dim" />
                  {:else}
                    <Store class="h-3.5 w-3.5 shrink-0 text-dim" />
                  {/if}
                  <span class="truncate">{loc.name}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="font-mono text-[11px] text-dim">{app.totalStockAt(loc.id)} prs</span>
                  {#if active}<Check class="h-3.5 w-3.5 text-fg" />{/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- 2. Counting Mode -->
      <div class="md:col-span-5">
        <span class="label">2. Stock Taking Mode</span>
        <div class="grid grid-cols-2 gap-1.5 rounded-lg border border-line bg-raised p-1">
          <button
            type="button"
            class="cursor-pointer rounded-md px-3 py-2 text-left transition {mode === 'audit' ? 'bg-fg text-bg shadow-xs' : 'text-muted hover:text-fg'}"
            onclick={() => (mode = 'audit')}
          >
            <div class="text-xs font-semibold">Physical Stock Count</div>
            <div class="text-[10px] opacity-80">Count shelf pairs & compare diff</div>
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-md px-3 py-2 text-left transition {mode === 'add' ? 'bg-fg text-bg shadow-xs' : 'text-muted hover:text-fg'}"
            onclick={() => (mode = 'add')}
          >
            <div class="text-xs font-semibold">Quick Stock In (+Add)</div>
            <div class="text-[10px] opacity-80">Add new pairs to existing stock</div>
          </button>
        </div>
      </div>

      <!-- 3. Session Note / Reference -->
      <div class="md:col-span-3">
        <label class="label" for="stockCountRefInput">3. Sheet Label / Rack Note</label>
        <input
          id="stockCountRefInput"
          type="text"
          class="input h-[46px]"
          placeholder="e.g. Rack A-D / Gents Section"
          bind:value={sessionTitle}
        />
      </div>
    </div>

    <!-- KPI Strip -->
    <div class="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      <div class="rounded-lg border border-line bg-raised/60 px-3 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-dim">Models in Sheet</div>
        <div class="mt-0.5 font-mono text-base font-bold text-fg">
          {stats.countedModels} <span class="text-xs font-normal text-dim">/ {stats.modelsCount}</span>
        </div>
      </div>
      <div class="rounded-lg border border-line bg-raised/60 px-3 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-dim">System Pairs</div>
        <div class="mt-0.5 font-mono text-base font-bold text-muted">{stats.totalSys.toLocaleString()}</div>
      </div>
      <div class="rounded-lg border border-line bg-raised/60 px-3 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-dim">
          {mode === 'audit' ? 'Counted Pairs' : 'Added Pairs (+)'}
        </div>
        <div class="mt-0.5 font-mono text-base font-bold text-fg">{stats.totalCounted.toLocaleString()}</div>
      </div>
      <div class="rounded-lg border border-line bg-raised/60 px-3 py-2.5">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-dim">
          {mode === 'audit' ? 'Net Variance (Diff)' : 'New Shop Total'}
        </div>
        {#if mode === 'audit'}
          <div
            class="mt-0.5 font-mono text-base font-bold {stats.netDiff < 0 ? 'text-bad' : stats.netDiff > 0 ? 'text-ok' : 'text-fg'}"
          >
            {stats.netDiff > 0 ? `+${stats.netDiff}` : stats.netDiff} prs
          </div>
        {:else}
          <div class="mt-0.5 font-mono text-base font-bold text-ok">
            {(stats.totalSys + stats.totalCounted).toLocaleString()} prs
          </div>
        {/if}
      </div>
      <div class="col-span-2 rounded-lg border border-line bg-raised/60 px-3 py-2.5 sm:col-span-1">
        <div class="text-[10px] font-semibold uppercase tracking-wider text-dim">Counted Retail Value</div>
        <div class="mt-0.5 truncate font-mono text-sm font-bold text-fg sm:text-base">{fmtMoney(stats.totalValue)}</div>
      </div>
    </div>
  </section>

  <!-- STEP 2: BARCODE SCANNER & MODEL SEARCH -->
  <section class="card p-4 sm:p-5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <ScanLine class="h-4 w-4 text-fg" />
        <h2 class="text-sm font-semibold text-fg">Scan Barcode or Search Shoe Model to Count</h2>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="chip cursor-pointer transition {app.autoScan ? 'border-fg bg-fg text-bg font-semibold' : 'text-muted'}"
          onclick={() => (app.autoScan = !app.autoScan)}
          title="When ON, scanning a barcode immediately adds +1 to that size"
        >
          <Zap class="h-3 w-3" />
          <span>Auto +1 Scan: {app.autoScan ? 'ON' : 'OFF'}</span>
        </button>
        <button
          type="button"
          class="btn btn-sm"
          onclick={() => (cameraOpen = true)}
        >
          <Camera class="h-3.5 w-3.5" />
          <span>Camera Scan</span>
        </button>
      </div>
    </div>

    <!-- Search / Barcode Input -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="relative mt-3" role="search" onclick={(e) => e.stopPropagation()}>
      <div class="relative flex items-center">
        <Search class="pointer-events-none absolute left-3.5 h-4 w-4 text-dim" />
        <input
          bind:this={searchInput}
          type="text"
          class="input h-11 pl-10 pr-24 font-mono text-sm"
          placeholder="Scan box barcode or type shoe code (e.g. SFW006, UB0622)..."
          value={query}
          oninput={(e) => onSearchInput((e.currentTarget as HTMLInputElement).value)}
          onfocus={() => { if (query.trim()) showResults = true; }}
          onkeydown={handleSearchKeydown}
        />
        {#if query}
          <button
            type="button"
            class="absolute right-2.5 rounded-md p-1.5 text-dim hover:bg-raised hover:text-fg"
            onclick={() => { query = ''; debounced = ''; showResults = false; searchInput?.focus(); }}
            aria-label="Clear search"
          >
            <X class="h-4 w-4" />
          </button>
        {/if}
      </div>

      <!-- Dropdown Results -->
      {#if showResults && debounced.trim().length >= 1}
        <div class="absolute left-0 right-0 z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl">
          {#if searchResults.length === 0}
            <div class="p-4 text-center">
              <p class="text-xs text-muted">"{debounced}" is not in the system catalog yet.</p>
              <div class="mt-2.5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  onclick={() => {
                    const code = debounced;
                    query = '';
                    debounced = '';
                    showResults = false;
                    countUnlistedBarcode(code);
                  }}
                >
                  <Plus class="h-3.5 w-3.5" />
                  <span>Count Barcode "{debounced.toUpperCase()}" (+1)</span>
                </button>
                <button
                  type="button"
                  class="btn btn-sm"
                  onclick={() => { showResults = false; openManualModal(); }}
                >
                  <PackagePlus class="h-3.5 w-3.5" />
                  <span>Add with All Sizes (36–45)</span>
                </button>
              </div>
            </div>
          {:else}
            <div class="divide-y divide-line">
              {#each searchResults as hit}
                {@const alreadyInSheet = groups.some((g) => g.productId === hit.productId)}
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-raised"
                  onclick={() => selectModelFromSearch(hit)}
                >
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-display text-sm font-bold text-fg">{hit.name}</span>
                      <span class="chip text-[10px]">{hit.brand}</span>
                      <span class="text-[11px] text-dim">{hit.category}</span>
                      {#if alreadyInSheet}
                        <span class="rounded bg-ok/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ok">In Sheet</span>
                      {/if}
                    </div>
                    <div class="mt-0.5 text-xs text-muted">
                      {hit.variants.length} sizes available • {fmtMoney(hit.sellingPrice)}
                      {#if hit.matchedVariant}
                        • Matched SKU: <span class="font-mono font-semibold text-fg">{hit.matchedVariant.sku}</span>
                        (Sz {getShoeDisplaySize(hit.matchedVariant.size, hit.matchedVariant.products)})
                      {/if}
                    </div>
                  </div>
                  <div class="shrink-0 text-right">
                    <div class="font-mono text-xs font-bold text-fg">Sys: {hit.shopStock} prs</div>
                    <div class="mt-0.5 text-[11px] font-medium text-muted">Click to count →</div>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </section>

  <!-- STEP 3: EXPORT EXCEL / PRINT / UPDATE BAR + STOCK COUNT SHEET -->
  <section class="card p-4 sm:p-5">
    <!-- Action Toolbar: Excel Downloads, Print, WhatsApp, DB Sync -->
    <div class="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 class="text-sm font-semibold text-fg">
          3. Counted Stock Sheet ({groups.length} {groups.length === 1 ? 'Model' : 'Models'})
        </h2>
        <p class="text-xs text-muted">
          Enter quantities per size below. Download as an Excel CSV sheet at any time or update system stock.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          onclick={handleExportMatrixCSV}
          disabled={groups.length === 0}
          title="Download Horizontal Size-Matrix Excel CSV (One row per model, Sizes 36-45 as columns)"
        >
          <Table class="h-3.5 w-3.5" />
          <span>Excel (Size Matrix)</span>
        </button>

        <button
          type="button"
          class="btn btn-sm font-semibold"
          onclick={handleExportDetailedCSV}
          disabled={groups.length === 0}
          title="Download Detailed SKU/Barcode Excel CSV (One row per size variant)"
        >
          <FileSpreadsheet class="h-3.5 w-3.5" />
          <span>Excel (Detailed SKU)</span>
        </button>

        <button
          type="button"
          class="btn btn-sm"
          onclick={handlePrintSheet}
          disabled={groups.length === 0}
        >
          <Printer class="h-3.5 w-3.5" />
          <span>Print</span>
        </button>

        <button
          type="button"
          class="btn btn-sm"
          onclick={handleWhatsAppShare}
          disabled={groups.length === 0}
        >
          <MessageCircle class="h-3.5 w-3.5" />
          <span>WhatsApp</span>
        </button>

        <button
          type="button"
          class="btn btn-sm border-fg/30 bg-raised font-semibold text-fg hover:bg-fg hover:text-bg"
          onclick={() => (confirmSyncOpen = true)}
          disabled={groups.length === 0}
          title="Update Supabase database stock levels for this shop"
        >
          <Database class="h-3.5 w-3.5" />
          <span>Update System Stock</span>
        </button>
      </div>
    </div>

    <!-- Sheet Filters & Quick Search -->
    {#if groups.length > 0}
      <div class="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap items-center gap-1.5">
          {#each [
            { id: 'ALL', label: `All (${groups.length})` },
            { id: 'COUNTED', label: `Counted (${stats.countedModels})` },
            { id: 'VARIANCE', label: `Variance / Diff` },
            { id: 'MATCHED', label: `Matched` },
          ] as f}
            <button
              type="button"
              class="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition {sheetFilter === f.id ? 'bg-fg text-bg font-semibold' : 'bg-raised text-muted hover:text-fg'}"
              onclick={() => (sheetFilter = f.id as any)}
            >
              {f.label}
            </button>
          {/each}
        </div>

        <div class="relative w-full sm:w-64">
          <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
          <input
            type="text"
            class="input h-8 pl-8 text-xs"
            placeholder="Filter counted models..."
            bind:value={sheetSearch}
          />
        </div>
      </div>
    {/if}

    <!-- Empty State -->
    {#if groups.length === 0}
      <div class="my-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-4 py-10 text-center">
        <div class="grid h-12 w-12 place-items-center rounded-full border border-line bg-raised text-muted">
          <ClipboardCheck class="h-6 w-6" />
        </div>
        <h3 class="mt-3 text-sm font-semibold text-fg">Your Shop Stock Count Sheet is Empty</h3>
        <p class="mt-1 max-w-md text-xs text-muted">
          Scan a shoe barcode above, search a model code (like <span class="font-mono text-fg">SFW006</span>), load existing shop stock, or add a new unlisted model.
        </p>
        <div class="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" class="btn btn-primary btn-sm" onclick={() => searchInput?.focus()}>
            <Search class="h-3.5 w-3.5" />
            <span>Search or Scan Shoe</span>
          </button>
          <button type="button" class="btn btn-sm" onclick={loadAllShopStockIntoSheet}>
            <Layers class="h-3.5 w-3.5" />
            <span>Load {locName} Stock</span>
          </button>
          <button type="button" class="btn btn-sm" onclick={openManualModal}>
            <PackagePlus class="h-3.5 w-3.5" />
            <span>+ New / Unlisted Model</span>
          </button>
        </div>
      </div>
    {:else if visibleGroups.length === 0}
      <p class="py-8 text-center text-xs text-muted">No models match the selected filter.</p>
    {:else}
      <!-- Model Cards List -->
      <div class="mt-4 space-y-3">
        {#each visibleGroups as g, gIdx (g.productId)}
          {@const modelSys = g.lines.reduce((s, l) => s + (Number(l.systemStock) || 0), 0)}
          {@const modelCnt = g.lines.reduce((s, l) => s + (Number(l.countedQty) || 0), 0)}
          {@const modelDiff = mode === 'audit' ? modelCnt - modelSys : modelCnt}
          {@const realIdx = groups.findIndex((x) => x.productId === g.productId)}

          <div
            class="rounded-xl border transition {activeProductId === g.productId ? 'border-fg/50 bg-raised/40' : 'border-line bg-raised/20'} p-3.5 sm:p-4"
          >
            <!-- Card Header -->
            <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  {#if g.isCustomModel}
                    <input
                      type="text"
                      class="h-7 rounded border border-line bg-bg px-2 font-display text-sm font-bold text-fg focus:border-fg focus:outline-none"
                      bind:value={g.name}
                      placeholder="Model Name / Barcode"
                      title="Edit unlisted model name or code"
                    />
                    <span class="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-warn">
                      Unlisted Barcode
                    </span>
                    <div class="inline-flex items-center gap-1 font-mono text-xs text-muted">
                      <span>Rs.</span>
                      <input
                        type="number"
                        min="0"
                        class="h-7 w-24 rounded border border-line bg-bg px-1.5 font-mono text-xs font-semibold text-fg focus:border-fg focus:outline-none"
                        bind:value={g.sellingPrice}
                        oninput={() => {
                          for (const ln of g.lines) ln.sellingPrice = Number(g.sellingPrice) || 0;
                        }}
                        placeholder="Price"
                        title="Optional selling price for Excel report"
                      />
                    </div>
                  {:else}
                    <span class="font-display text-base font-bold text-fg">{g.name}</span>
                    <span class="chip text-[10px]">{g.brand}</span>
                    <span class="text-xs text-dim">{g.category}</span>
                    <span class="font-mono text-xs font-semibold text-muted">{fmtMoney(g.sellingPrice)}</span>
                  {/if}
                </div>
                <div class="mt-1 flex flex-wrap items-center gap-3 font-mono text-xs">
                  <span class="text-dim">System: <b class="text-muted">{modelSys} prs</b></span>
                  <span class="text-fg">
                    {mode === 'audit' ? 'Counted:' : 'Added:'} <b>{modelCnt} prs</b>
                  </span>
                  {#if mode === 'audit'}
                    <span class="font-bold {modelDiff < 0 ? 'text-bad' : modelDiff > 0 ? 'text-ok' : 'text-dim'}">
                      Diff: {modelDiff > 0 ? `+${modelDiff}` : modelDiff}
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Model Quick Actions -->
              <div class="flex flex-wrap items-center gap-1.5 shrink-0">
                {#if !g.isCustomModel}
                  <button
                    type="button"
                    class="btn btn-sm text-[11px]"
                    onclick={() => copySystemToCountedForGroup(g)}
                    title="Copy system stock into counted boxes for this model"
                  >
                    <Copy class="h-3 w-3" />
                    <span>Match Sys</span>
                  </button>
                {/if}
                <button
                  type="button"
                  class="btn btn-sm text-[11px]"
                  onclick={() => openCustomSizeModal(realIdx)}
                  title="Add another size to this shoe model"
                >
                  <Plus class="h-3 w-3" />
                  <span>+ Size</span>
                </button>
                <button
                  type="button"
                  class="btn btn-sm text-[11px] text-muted hover:text-fg"
                  onclick={() => zeroGroupCounts(g)}
                  title="Reset all sizes of this model to 0"
                >
                  <span>Zero</span>
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm text-dim hover:text-bad"
                  onclick={() => removeGroup(g.productId)}
                  aria-label="Remove model from sheet"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <!-- Size Matrix Grid -->
            <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {#each g.lines as line (line.variantId)}
                {@const lDiff = mode === 'audit' ? line.countedQty - line.systemStock : line.countedQty}
                {@const flashed = lastScannedVariantId === line.variantId}
                <div
                  class="flex flex-col justify-between rounded-lg border p-2 transition
                    {flashed
                      ? 'border-ok bg-ok/15 ring-2 ring-ok/40'
                      : line.countedQty > 0
                        ? 'border-fg/40 bg-surface'
                        : 'border-line bg-surface/60'}"
                >
                  <div class="flex items-center justify-between gap-1">
                    {#if line.isCustom}
                      <div class="flex items-center gap-1">
                        <span class="font-mono text-[11px] font-bold text-muted">Sz</span>
                        <input
                          type="text"
                          class="h-5 w-12 rounded border border-line bg-bg px-1 text-center font-mono text-xs font-bold text-fg focus:border-fg focus:outline-none"
                          bind:value={line.size}
                          oninput={() => {
                            line.displaySize = line.size.trim() || '-';
                          }}
                          placeholder="Size"
                          title="Type size (e.g. 40, 41)"
                        />
                      </div>
                    {:else}
                      <span class="font-mono text-xs font-bold text-fg">Sz {line.displaySize}</span>
                    {/if}
                    <span class="font-mono text-[10px] text-dim" title="Current system stock">
                      Sys: {line.systemStock}
                    </span>
                  </div>

                  <!-- Stepper Row -->
                  <div class="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      class="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md border border-line bg-raised text-fg hover:bg-line active:scale-95"
                      onclick={() => (line.countedQty = Math.max(0, (Number(line.countedQty) || 0) - 1))}
                      aria-label="Decrease size {line.displaySize}"
                    >
                      <Minus class="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      class="h-8 w-full min-w-0 rounded-md border border-line bg-bg text-center font-mono text-xs font-bold text-fg focus:border-fg focus:outline-none"
                      bind:value={line.countedQty}
                      onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      class="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md border border-line bg-raised text-fg hover:bg-line active:scale-95"
                      onclick={() => (line.countedQty = Math.max(0, (Number(line.countedQty) || 0) + 1))}
                      aria-label="Increase size {line.displaySize}"
                    >
                      <Plus class="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <!-- Variance Footer -->
                  <div class="mt-1.5 flex items-center justify-between font-mono text-[10px]">
                    <span class="truncate text-dim" title={line.sku}>{line.sku || '-'}</span>
                    {#if mode === 'audit'}
                      <span
                        class="font-semibold {lDiff < 0 ? 'text-bad' : lDiff > 0 ? 'text-ok' : 'text-dim'}"
                      >
                        {lDiff > 0 ? `+${lDiff}` : lDiff === 0 ? '✓' : lDiff}
                      </span>
                    {:else if line.countedQty > 0}
                      <span class="font-semibold text-ok">→ {line.systemStock + line.countedQty}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<!-- CAMERA BARCODE SCANNER MODAL -->
{#if cameraOpen}
  <CameraScanner onscan={handleCameraScan} onclose={() => (cameraOpen = false)} />
{/if}

<!-- MANUAL / UNLISTED MODEL MODAL -->
{#if manualModalOpen}
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-xs sm:items-center sm:p-4">
    <div class="card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl">
      <div class="flex items-center justify-between border-b border-line pb-3">
        <div>
          <h3 class="text-sm font-bold text-fg">Add Unlisted / New Shoe Model to Sheet</h3>
          <p class="text-xs text-muted">Great for new designs you want included in your Excel Stock Sheet.</p>
        </div>
        <button class="btn btn-ghost btn-sm" onclick={() => (manualModalOpen = false)} aria-label="Close">
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="label" for="manualModelCode">Shoe Code / Model Name *</label>
          <input
            id="manualModelCode"
            type="text"
            class="input"
            placeholder="e.g. SFW-NEW-01 or Nike Air Force Black"
            bind:value={manualName}
          />
        </div>
        <div>
          <label class="label" for="manualBrandInput">Brand</label>
          <input id="manualBrandInput" type="text" class="input" placeholder="Generic" bind:value={manualBrand} />
        </div>
        <div>
          <label class="label" for="manualPriceInput">Selling Price (Rs.)</label>
          <input id="manualPriceInput" type="number" min="0" class="input font-mono" bind:value={manualPrice} />
        </div>
      </div>

      <div class="mt-4">
        <span class="label">Enter Initial Counted Quantities by Size (36–45)</span>
        <div class="mt-1.5 grid grid-cols-5 gap-2">
          {#each Object.keys(manualSizes) as sz}
            <div class="rounded-lg border border-line bg-raised p-2 text-center">
              <div class="font-mono text-xs font-bold text-fg">Sz {sz}</div>
              <input
                type="number"
                min="0"
                class="mt-1 h-8 w-full rounded border border-line bg-bg text-center font-mono text-xs font-bold text-fg"
                bind:value={manualSizes[sz]}
                onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
              />
            </div>
          {/each}
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <button type="button" class="btn" onclick={() => (manualModalOpen = false)}>Cancel</button>
        <button type="button" class="btn btn-primary" onclick={saveManualModel}>
          <Check class="h-4 w-4" />
          <span>Add to Stock Sheet</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ADD CUSTOM SIZE MODAL -->
{#if customSizeGroupIdx !== null}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
    <div class="card w-full max-w-sm p-5">
      <div class="flex items-center justify-between border-b border-line pb-3">
        <h3 class="text-sm font-bold text-fg">Add Size to {groups[customSizeGroupIdx]?.name}</h3>
        <button class="btn btn-ghost btn-sm" onclick={() => (customSizeGroupIdx = null)}>
          <X class="h-4 w-4" />
        </button>
      </div>
      <div class="mt-4 space-y-3">
        <div>
          <label class="label" for="customSzInput">Shoe Size (EU or UK)</label>
          <input
            id="customSzInput"
            type="text"
            class="input font-mono"
            placeholder="e.g. 35, 46, 47"
            bind:value={customSizeInput}
          />
        </div>
        <div>
          <label class="label" for="customSzQtyInput">Counted Quantity</label>
          <input
            id="customSzQtyInput"
            type="number"
            min="0"
            class="input font-mono"
            bind:value={customSizeQty}
          />
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button class="btn" onclick={() => (customSizeGroupIdx = null)}>Cancel</button>
        <button class="btn btn-primary" onclick={addCustomSizeToGroup}>Add Size</button>
      </div>
    </div>
  </div>
{/if}

<!-- CONFIRM DATABASE STOCK UPDATE MODAL -->
{#if confirmSyncOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
    <div class="card w-full max-w-md p-5">
      <div class="flex items-start gap-3">
        <div class="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-raised text-fg">
          <Database class="h-5 w-5" />
        </div>
        <div>
          <h3 class="text-base font-bold text-fg">Update System Stock for {locName}?</h3>
          <p class="mt-1 text-xs text-muted">
            {#if mode === 'audit'}
              This will overwrite the system stock of counted models in <b>{locName}</b> with your exact counted quantities.
            {:else}
              This will add <b>+{stats.totalCounted} pairs</b> on top of existing stock in <b>{locName}</b>.
            {/if}
          </p>
        </div>
      </div>

      <div class="mt-4 rounded-lg border border-line bg-raised p-3 font-mono text-xs space-y-1">
        <div class="flex justify-between">
          <span class="text-muted">Branch:</span>
          <span class="font-bold text-fg">{locName}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted">Mode:</span>
          <span class="font-bold text-fg">{mode === 'audit' ? 'Physical Audit (Set Exact)' : 'Stock In (+Add)'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted">Counted Pairs:</span>
          <span class="font-bold text-fg">{stats.totalCounted} prs</span>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button class="btn" onclick={() => (confirmSyncOpen = false)} disabled={syncingDb}>Cancel</button>
        <button class="btn btn-primary" onclick={syncCountToDatabase} disabled={syncingDb}>
          {#if syncingDb}
            <Loader2 class="h-4 w-4 animate-spin" />
            <span>Updating...</span>
          {:else}
            <CheckCircle2 class="h-4 w-4" />
            <span>Confirm & Update Stock</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
