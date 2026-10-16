<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ClipboardCheck, Store, Building2, ChevronDown, Check, Search, ScanLine, Camera, Zap, Plus, Minus,
    Trash2, FileSpreadsheet, Table, Printer, MessageCircle, Database, RotateCcw, PackagePlus,
    X, CheckCircle2, Loader2, Copy, Layers, Palette, BookmarkCheck, FolderClock, Download,
  } from 'lucide-svelte';
  import { app, getShoeDisplaySize, fmtMoney } from '../../lib/app.svelte';
  import { restGet, restWrite } from '../../lib/api';
  import { SoundFx } from '../../lib/sound';
  import type { Variant } from '../../lib/types';
  import CameraScanner from '../transfer/CameraScanner.svelte';
  import {
    type CountMode,
    type CountedModelGroup,
    type CountedVariantLine,
    type SavedStockSnapshot,
    COMMON_SHOE_COLOURS,
    extractBaseSkuAndSize,
    normalizeSizeKey,
    findCatalogVariantsForBaseSku,
    loadStockCountDraft,
    saveStockCountDraft,
    clearStockCountDraft,
    loadSavedSnapshots,
    saveSnapshotToStorage,
    deleteSnapshotFromStorage,
    sortLinesBySize,
    buildGroupFromCatalogProduct,
    cloneGroupForNewColour,
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
  let snapshots = $state<SavedStockSnapshot[]>([]);
  let lastSavedTime = $state('');

  // UI controls
  let locDropdownOpen = $state(false);
  let query = $state('');
  let debounced = $state('');
  let showResults = $state(false);
  let cameraOpen = $state(false);
  let sheetFilter = $state<'ALL' | 'COUNTED' | 'VARIANCE' | 'MATCHED'>('ALL');
  let sheetSearch = $state('');
  let activeGroupKey = $state<string | null>(null);
  let lastScannedVariantId = $state<string | null>(null);

  // Colour picker modal for adding a new colour variant of a model
  let colourModalGroupKey = $state<string | null>(null);
  let customColourText = $state('');

  // Saved snapshots drawer/modal
  let snapshotsModalOpen = $state(false);

  // Manual / unlisted model modal
  let manualModalOpen = $state(false);
  let manualName = $state('');
  let manualColour = $state('Black');
  let manualBrand = $state('Generic');
  let manualCategory = $state('General');
  let manualPrice = $state<number>(0);
  let manualSizes = $state<Record<string, number>>({
    '36': 0, '37': 0, '38': 0, '39': 0, '40': 0, '41': 0, '42': 0, '43': 0, '44': 0, '45': 0,
  });

  // Custom size modal for an existing model group
  let customSizeGroupKey = $state<string | null>(null);
  let customSizeInput = $state('');
  let customSizeQty = $state(1);

  // Confirm DB sync modal
  let confirmSyncOpen = $state(false);
  let syncingDb = $state(false);

  let searchInput: HTMLInputElement | undefined = $state();
  let debounceTimer: ReturnType<typeof setTimeout>;
  let draftLoaded = $state(false);

  /**
   * Automatically merges any previously split cards that share the same Base SKU + Colour
   * (e.g., if 4 slippers were scanned earlier as 4 separate cards because of the last-2-digit size).
   */
  function consolidateSplitGroups(rawGroups: CountedModelGroup[]): CountedModelGroup[] {
    const mergedMap = new Map<string, CountedModelGroup>();

    for (const g of rawGroups) {
      const { baseSku, size: extractedSz } = extractBaseSkuAndSize(g.name);
      const cleanName = baseSku || g.name.trim().toUpperCase();
      const col = g.colour || 'All / Default';
      const key = `${cleanName}__${col.toUpperCase()}`;

      let target = mergedMap.get(key);
      if (!target) {
        target = {
          ...g,
          groupKey: key,
          name: cleanName,
          colour: col,
          lines: [],
        };
        mergedMap.set(key, target);
      }

      for (const l of g.lines) {
        const lineSplit = extractBaseSkuAndSize(l.barcode || l.sku || '');
        const resolvedSz =
          l.size && l.size !== '-'
            ? normalizeSizeKey(l.size)
            : extractedSz || lineSplit.size || '-';

        // If this was an auto-generated 36-45 empty line on a card that actually had a specific barcode size,
        // transfer any default count onto the extracted size
        const existingLine = target.lines.find((x) => normalizeSizeKey(x.size) === resolvedSz);
        if (existingLine) {
          existingLine.countedQty += Number(l.countedQty) || 0;
          existingLine.systemStock = Math.max(existingLine.systemStock, Number(l.systemStock) || 0);
        } else {
          target.lines.push({
            ...l,
            size: resolvedSz,
            displaySize: resolvedSz,
            countedQty: Number(l.countedQty) || 0,
          });
        }
      }

      target.lines = sortLinesBySize(target.lines);
    }

    return Array.from(mergedMap.values());
  }

  function persistNow() {
    if (!draftLoaded) return;
    const now = new Date();
    saveStockCountDraft({
      locationId,
      mode,
      sessionTitle,
      notes,
      groups,
      updatedAt: now.toISOString(),
    });
    lastSavedTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // ---------------- lifecycle & persistence ----------------
  onMount(() => {
    snapshots = loadSavedSnapshots();
    const saved = loadStockCountDraft();
    if (saved) {
      locationId = saved.locationId || app.fromId || app.locations[0]?.id || '';
      mode = saved.mode || 'audit';
      sessionTitle = saved.sessionTitle || '';
      notes = saved.notes || '';
      groups = consolidateSplitGroups(saved.groups || []);
      if (groups.length > 0) activeGroupKey = groups[0].groupKey;
      lastSavedTime = new Date(saved.updatedAt || Date.now()).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } else {
      locationId = app.fromId || app.locations[0]?.id || '';
    }
    draftLoaded = true;
  });

  $effect(() => {
    if (!locationId && app.locations.length > 0) {
      locationId = app.fromId || app.locations[0].id;
    }
  });

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

  $effect(() => {
    if (!draftLoaded) return;
    const _touch = groups
      .map((g) => `${g.name}_${g.colour}_${g.sellingPrice}_${g.lines.map((l) => `${l.size}:${l.countedQty}`).join(',')}`)
      .join('|');
    const _meta = `${locationId}_${mode}_${sessionTitle}_${notes}`;
    void _touch;
    void _meta;
    persistNow();
  });

  // ---------------- derived stats ----------------
  const selectedLoc = $derived(app.locations.find((l) => l.id === locationId));
  const locName = $derived(selectedLoc?.name || 'Select Shop');
  const activeGroup = $derived(groups.find((g) => g.groupKey === activeGroupKey) || groups[0] || null);

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

  // ---------------- catalog search & Smart Barcode Scanner ----------------
  interface ModelSearchHit {
    baseSku: string;
    productId: string;
    name: string;
    brand: string;
    category: string;
    sellingPrice: number;
    shopStock: number;
    variants: Variant[];
    matchedVariant?: Variant;
    matchedSize?: string | null;
  }

  function searchModels(q0: string): ModelSearchHit[] {
    if (!q0 || q0.trim().length < 1) return [];
    const q = q0.trim().toUpperCase();
    const { baseSku: qBase, size: qSize } = extractBaseSkuAndSize(q);
    const hitsByBase = new Map<string, ModelSearchHit>();

    for (const [productId, variants] of app.productsMap.entries()) {
      if (!variants || variants.length === 0) continue;
      const first = variants[0];
      const p = first.products;
      const rawName = p?.name || first.sku || 'Shoe Model';
      const { baseSku: modelBase } = extractBaseSkuAndSize(rawName);
      const cleanModelName = modelBase || rawName;
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
          (v.sku && v.sku.toUpperCase().includes(q)) ||
          (qBase && v.sku && extractBaseSkuAndSize(v.sku).baseSku === qBase),
      );
      const nameMatch =
        rawName.toUpperCase().includes(q) ||
        cleanModelName.toUpperCase().includes(q) ||
        (qBase.length >= 2 && cleanModelName.toUpperCase() === qBase);
      const brandMatch = brand.toUpperCase().includes(q);
      const catMatch = category.toUpperCase().includes(q);

      if (!exactVariant && !partialVariant && !nameMatch && !brandMatch && !catMatch) continue;

      let shopStock = 0;
      for (const v of variants) shopStock += app.getStock(v.id, locationId);

      const key = cleanModelName.toUpperCase();
      const existingHit = hitsByBase.get(key);
      if (existingHit) {
        for (const v of variants) {
          if (!existingHit.variants.some((ev) => ev.id === v.id)) existingHit.variants.push(v);
        }
        existingHit.shopStock += shopStock;
        if (exactVariant) existingHit.matchedVariant = exactVariant;
      } else {
        hitsByBase.set(key, {
          baseSku: key,
          productId,
          name: cleanModelName,
          brand,
          category,
          sellingPrice: Number(first.selling_price) || 0,
          shopStock,
          variants: [...variants],
          matchedVariant: exactVariant || partialVariant,
          matchedSize: qSize,
        });
      }
    }

    const hits = Array.from(hitsByBase.values());
    hits.sort((a, b) => {
      const aEx = a.matchedVariant && (a.matchedVariant.barcode?.toUpperCase() === q || a.matchedVariant.sku?.toUpperCase() === q);
      const bEx = b.matchedVariant && (b.matchedVariant.barcode?.toUpperCase() === q || b.matchedVariant.sku?.toUpperCase() === q);
      if (aEx && !bEx) return -1;
      if (!aEx && bEx) return 1;
      if (a.name.toUpperCase().startsWith(qBase) && !b.name.toUpperCase().startsWith(qBase)) return -1;
      if (!a.name.toUpperCase().startsWith(qBase) && b.name.toUpperCase().startsWith(qBase)) return 1;
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

  function flashVariant(gKey: string, vid: string) {
    activeGroupKey = gKey;
    lastScannedVariantId = vid;
    SoundFx.scan();
    persistNow();
    setTimeout(() => {
      if (lastScannedVariantId === vid) lastScannedVariantId = null;
    }, 1400);
  }

  /**
   * Core Smart Barcode & SKU Handler:
   * 1. Extracts Base SKU + Last 2 Digits Size (01..50).
   * 2. Searches the ENTIRE Stock Count Sheet (`groups`) from top to bottom.
   *    If this Base SKU was already scanned earlier (even in another part of the shop!),
   *    moves that existing card to the top and adds +1 to that size!
   * 3. Otherwise creates ONE unified card for the Base SKU (combining any catalog variants)
   *    and sets the scanned size to +1.
   */
  function processSmartScan(rawInput: string, incrementBy = 1) {
    const q = rawInput.trim().toUpperCase();
    if (!q) return;

    // 1. Check if an exact variant in catalog has this barcode/SKU
    const exactCatalogVar = app.catalog.find(
      (v) => (v.barcode && v.barcode.toUpperCase() === q) || (v.sku && v.sku.toUpperCase() === q),
    );

    // 2. Determine Base Model SKU and Size (Last 2 digits = Size 1..50)
    const splitFromBarcode = extractBaseSkuAndSize(q);
    let baseSku = splitFromBarcode.baseSku;
    let detectedSize = splitFromBarcode.size;

    if (exactCatalogVar) {
      const catProdName = (exactCatalogVar.products?.name || exactCatalogVar.sku || '').trim();
      const splitProd = extractBaseSkuAndSize(catProdName);
      const splitVarSku = extractBaseSkuAndSize(exactCatalogVar.sku || '');

      // If catalog variant has an explicit size field (1..50), use it; otherwise use the last-2-digit size!
      const rawCatSz = (exactCatalogVar.size || '').toString().trim();
      if (rawCatSz && rawCatSz !== '-') {
        detectedSize = normalizeSizeKey(rawCatSz);
      } else if (splitVarSku.size) {
        detectedSize = splitVarSku.size;
      }

      // Use the stripped base SKU so 4 variants saved as separate products still merge into 1 card!
      if (splitVarSku.size && splitVarSku.baseSku) {
        baseSku = splitVarSku.baseSku;
      } else if (splitProd.size && splitProd.baseSku) {
        baseSku = splitProd.baseSku;
      } else if (catProdName) {
        baseSku = catProdName.toUpperCase();
      }
    }

    const cleanBase = (baseSku || q).trim().toUpperCase();

    // 3. Search ENTIRE existing sheet (`groups`) for a matching card (preferring active colour if same base SKU)
    let existingIdx = groups.findIndex(
      (g) => g.groupKey === activeGroupKey && g.name.trim().toUpperCase() === cleanBase,
    );
    if (existingIdx === -1) {
      existingIdx = groups.findIndex((g) => g.name.trim().toUpperCase() === cleanBase);
    }
    // Also check if any line inside `groups` has this exact barcode
    if (existingIdx === -1) {
      existingIdx = groups.findIndex((g) =>
        g.lines.some((l) => (l.barcode && l.barcode.toUpperCase() === q) || (l.sku && l.sku.toUpperCase() === q)),
      );
    }

    if (existingIdx !== -1) {
      const grp = groups[existingIdx];
      const wasFurtherDown = existingIdx > 0;
      if (wasFurtherDown) {
        groups.splice(existingIdx, 1);
        groups.unshift(grp);
      }

      // Find or create the size line inside this existing group
      const targetSz = detectedSize ? normalizeSizeKey(detectedSize) : null;
      let line = grp.lines.find(
        (l) =>
          (targetSz && normalizeSizeKey(l.size) === targetSz) ||
          (l.barcode && l.barcode.toUpperCase() === q) ||
          (l.sku && l.sku.toUpperCase() === q),
      );

      if (!line && targetSz) {
        const newVid = exactCatalogVar?.id || `sz_${grp.groupKey}_${targetSz}_${Date.now()}`;
        line = {
          variantId: newVid,
          productId: exactCatalogVar?.product_id || grp.productId,
          sku: exactCatalogVar?.sku || `${cleanBase}${targetSz.padStart(2, '0')}`,
          barcode: q,
          size: targetSz,
          displaySize: targetSz,
          colour: grp.colour,
          sellingPrice: Number(exactCatalogVar?.selling_price || grp.sellingPrice) || 0,
          costPrice: Number(exactCatalogVar?.cost_price || grp.costPrice) || 0,
          systemStock: exactCatalogVar ? app.getStock(exactCatalogVar.id, locationId) : 0,
          countedQty: 0,
          isCustom: !exactCatalogVar,
        };
        grp.lines = sortLinesBySize([...grp.lines, line]);
      }

      if (line) {
        line.countedQty = Math.max(0, (Number(line.countedQty) || 0) + incrementBy);
        line.lastScannedAt = Date.now();
        flashVariant(grp.groupKey, line.variantId);
        const colTag = grp.colour && grp.colour !== 'All / Default' ? ` [${grp.colour}]` : '';
        app.toast(
          wasFurtherDown
            ? `+${incrementBy} Added to Earlier Model: ${grp.name}${colTag} • Sz ${line.size} (Total: ${line.countedQty})`
            : `+${incrementBy} Counted: ${grp.name}${colTag} • Sz ${line.size} (Total: ${line.countedQty})`,
          'success',
        );
      } else {
        activeGroupKey = grp.groupKey;
        SoundFx.scan();
        app.toast(`Selected ${grp.name} — Tap the shoe size below!`, 'info');
      }
      return;
    }

    // 4. Not yet in sheet -> Check if catalog has variants for this Base SKU
    const catalogVars = findCatalogVariantsForBaseSku(cleanBase, exactCatalogVar?.product_id);
    if (catalogVars.length > 0) {
      const pid = exactCatalogVar?.product_id || catalogVars[0].product_id || catalogVars[0].id;
      const newGrp = buildGroupFromCatalogProduct(pid, catalogVars, locationId, undefined, cleanBase);
      const targetSz = detectedSize ? normalizeSizeKey(detectedSize) : null;

      let line = newGrp.lines.find(
        (l) =>
          (targetSz && normalizeSizeKey(l.size) === targetSz) ||
          (exactCatalogVar && l.variantId === exactCatalogVar.id),
      );

      if (!line && targetSz) {
        line = {
          variantId: exactCatalogVar?.id || `sz_${newGrp.groupKey}_${targetSz}`,
          productId: pid,
          sku: q,
          barcode: q,
          size: targetSz,
          displaySize: targetSz,
          colour: newGrp.colour,
          sellingPrice: newGrp.sellingPrice,
          costPrice: newGrp.costPrice,
          systemStock: exactCatalogVar ? app.getStock(exactCatalogVar.id, locationId) : 0,
          countedQty: 0,
          isCustom: !exactCatalogVar,
        };
        newGrp.lines = sortLinesBySize([...newGrp.lines, line]);
      }

      if (line && incrementBy > 0) {
        line.countedQty = incrementBy;
        line.lastScannedAt = Date.now();
      }
      groups.unshift(newGrp);
      flashVariant(newGrp.groupKey, line?.variantId || newGrp.lines[0]?.variantId || '');
      app.toast(
        line
          ? `+${incrementBy} Counted: ${newGrp.name} • Sz ${line.size}`
          : `Added ${newGrp.name} to Stock Sheet`,
        'success',
      );
      return;
    }

    // 5. Brand-new Unlisted Model -> Create ONE card with Base SKU and the detected size!
    const pid = `unlisted_${cleanBase}_${Date.now()}`;
    const defaultCol = 'All / Default';
    const gKey = `${cleanBase}__${defaultCol}`;
    const targetSz = detectedSize ? normalizeSizeKey(detectedSize) : null;

    // Seed common sizes plus the scanned size so the card has a clean size matrix ready
    const seedSizes = new Set<string>(['36', '37', '38', '39', '40', '41', '42', '43', '44', '45']);
    if (targetSz) seedSizes.add(targetSz);

    const lines: CountedVariantLine[] = sortLinesBySize(
      Array.from(seedSizes).map((sz) => ({
        variantId: `${gKey}_sz_${sz}`,
        productId: pid,
        sku: `${cleanBase}${sz.padStart(2, '0')}`,
        barcode: targetSz === sz ? q : '',
        size: sz,
        displaySize: sz,
        colour: defaultCol,
        sellingPrice: 0,
        costPrice: 0,
        systemStock: 0,
        countedQty: targetSz ? (targetSz === sz ? incrementBy : 0) : 0,
        isCustom: true,
        lastScannedAt: targetSz === sz ? Date.now() : undefined,
      })),
    );

    const newGroup: CountedModelGroup = {
      groupKey: gKey,
      productId: pid,
      name: cleanBase,
      colour: defaultCol,
      brand: 'Unlisted',
      category: 'Scanned Model',
      gender: '',
      sellingPrice: 0,
      costPrice: 0,
      isCustomModel: true,
      lines,
    };

    groups.unshift(newGroup);
    const hitLine = lines.find((l) => l.countedQty > 0) || lines[0];
    flashVariant(gKey, hitLine.variantId);
    app.toast(
      targetSz
        ? `+${incrementBy} Counted: Model "${cleanBase}" • Sz ${targetSz}`
        : `Added Model "${cleanBase}" — Tap sizes below to count!`,
      'success',
    );
  }

  function selectModelFromSearch(hit: ModelSearchHit) {
    if (hit.matchedVariant && app.autoScan) {
      processSmartScan(hit.matchedVariant.barcode || hit.matchedVariant.sku || hit.name, 1);
    } else {
      const allVars = findCatalogVariantsForBaseSku(hit.name, hit.productId);
      const existingIdx = groups.findIndex((g) => g.name.toUpperCase() === hit.name.toUpperCase());
      if (existingIdx !== -1) {
        const grp = groups[existingIdx];
        if (existingIdx > 0) {
          groups.splice(existingIdx, 1);
          groups.unshift(grp);
        }
        activeGroupKey = grp.groupKey;
      } else {
        const newGrp = buildGroupFromCatalogProduct(hit.productId, allVars.length ? allVars : hit.variants, locationId, undefined, hit.name);
        groups.unshift(newGrp);
        activeGroupKey = newGrp.groupKey;
      }
      SoundFx.scan();
      persistNow();
      app.toast(`Selected ${hit.name} — Tap sizes below!`, 'info');
    }
    query = '';
    debounced = '';
    showResults = false;
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

    processSmartScan(q, 1);
    query = '';
    debounced = '';
    showResults = false;
  }

  function handleCameraScan(code: string) {
    const q = code.trim().toUpperCase();
    if (!q) return;
    processSmartScan(q, 1);
  }

  // ---------------- Colour management (Same Code, Different Colours) ----------------
  function openAddColourModal(groupKey: string) {
    colourModalGroupKey = groupKey;
    customColourText = '';
  }

  function createColourVariantGroup(colourName: string) {
    if (!colourModalGroupKey) return;
    const src = groups.find((g) => g.groupKey === colourModalGroupKey);
    if (!src) return;
    const clean = colourName.trim();
    if (!clean) {
      app.toast('Please select or type a colour.', 'warning');
      return;
    }

    const existing = groups.find(
      (g) => g.name.toUpperCase() === src.name.toUpperCase() && g.colour.toUpperCase() === clean.toUpperCase(),
    );
    if (existing) {
      activeGroupKey = existing.groupKey;
      colourModalGroupKey = null;
      app.toast(`Switched to existing ${src.name} [${existing.colour}] card.`, 'info');
      return;
    }

    const cloned = cloneGroupForNewColour(src, clean);
    groups.unshift(cloned);
    activeGroupKey = cloned.groupKey;
    colourModalGroupKey = null;
    SoundFx.scan();
    persistNow();
    app.toast(`Created "${cloned.name}" in colour [${clean}]! Now enter sizes.`, 'success');
  }

  // ---------------- Snapshots (Saved Sheets History) ----------------
  function saveCurrentAsSnapshot() {
    if (groups.length === 0) {
      app.toast('Sheet is empty — count some shoes first.', 'warning');
      return;
    }
    const label =
      sessionTitle.trim() ||
      `${locName} — ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    const snap: SavedStockSnapshot = {
      id: `snap_${Date.now()}`,
      title: label,
      locationId,
      locationName: locName,
      mode,
      totalModels: groups.length,
      totalPairs: stats.totalCounted,
      savedAt: new Date().toLocaleString('en-GB'),
      groups: JSON.parse(JSON.stringify(groups)),
    };
    snapshots = saveSnapshotToStorage(snap);
    SoundFx.success();
    app.toast(`Saved backup copy "${label}" to Saved Sheets!`, 'success');
  }

  function restoreSnapshot(snap: SavedStockSnapshot) {
    locationId = snap.locationId || locationId;
    mode = snap.mode;
    sessionTitle = snap.title;
    groups = consolidateSplitGroups(JSON.parse(JSON.stringify(snap.groups)));
    activeGroupKey = groups[0]?.groupKey || null;
    snapshotsModalOpen = false;
    persistNow();
    app.toast(`Loaded saved sheet "${snap.title}".`, 'success');
  }

  function removeSnapshot(id: string) {
    snapshots = deleteSnapshotFromStorage(id);
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
      const first = variants[0];
      const rawName = first?.products?.name || first?.sku || 'Shoe Model';
      const { baseSku } = extractBaseSkuAndSize(rawName);
      const cleanBase = (baseSku || rawName).toUpperCase();
      if (groups.some((g) => g.name.toUpperCase() === cleanBase)) continue;
      groups.push(buildGroupFromCatalogProduct(productId, variants, locationId, undefined, cleanBase));
      addedCount++;
    }
    if (addedCount > 0) {
      activeGroupKey = groups[0]?.groupKey || null;
      SoundFx.scan();
      persistNow();
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
    persistNow();
  }

  function zeroGroupCounts(g: CountedModelGroup) {
    for (const l of g.lines) {
      l.countedQty = 0;
    }
    persistNow();
  }

  function removeGroup(groupKey: string) {
    groups = groups.filter((g) => g.groupKey !== groupKey);
    if (activeGroupKey === groupKey) activeGroupKey = groups[0]?.groupKey || null;
    persistNow();
  }

  function clearEntireSheet() {
    if (groups.length === 0) return;
    if (!confirm('Clear all counted shoes from the current Stock Count sheet?')) return;
    groups = [];
    sessionTitle = '';
    notes = '';
    activeGroupKey = null;
    clearStockCountDraft();
    app.toast('Stock count sheet cleared.', 'info');
  }

  // ---------------- manual / unlisted model entry ----------------
  function openManualModal() {
    const { baseSku } = extractBaseSkuAndSize(query.trim());
    manualName = baseSku || query.trim().toUpperCase();
    manualColour = 'All / Default';
    manualBrand = 'Generic';
    manualCategory = 'General';
    manualPrice = 0;
    manualSizes = { '36': 0, '37': 0, '38': 0, '39': 0, '40': 0, '41': 0, '42': 0, '43': 0, '44': 0, '45': 0 };
    manualModalOpen = true;
  }

  function saveManualModel() {
    const cleanName = manualName.trim().toUpperCase();
    if (!cleanName) {
      app.toast('Please enter a Shoe Model Code or Name.', 'warning');
      return;
    }
    const cleanCol = manualColour.trim() || 'All / Default';
    const pid = `custom_model_${Date.now()}`;
    const gKey = `${cleanName}__${cleanCol}`;
    const lines: CountedVariantLine[] = Object.entries(manualSizes).map(([sz, qty]) => ({
      variantId: `${gKey}_sz_${sz}`,
      productId: pid,
      sku: `${cleanName}${sz.padStart(2, '0')}`,
      barcode: `${cleanName}${sz.padStart(2, '0')}`,
      size: sz,
      displaySize: sz,
      colour: cleanCol,
      sellingPrice: Number(manualPrice) || 0,
      costPrice: 0,
      systemStock: 0,
      countedQty: Math.max(0, Number(qty) || 0),
      isCustom: true,
    }));

    groups.unshift({
      groupKey: gKey,
      productId: pid,
      name: cleanName,
      colour: cleanCol,
      brand: manualBrand.trim() || 'Generic',
      category: manualCategory.trim() || 'General',
      gender: '',
      sellingPrice: Number(manualPrice) || 0,
      costPrice: 0,
      isCustomModel: true,
      lines: sortLinesBySize(lines),
    });

    activeGroupKey = gKey;
    manualModalOpen = false;
    SoundFx.scan();
    persistNow();
    app.toast(`Added "${cleanName}" to Stock Sheet.`, 'success');
  }

  // ---------------- custom size (1..50) for a model ----------------
  function openCustomSizeModal(groupKey: string) {
    customSizeGroupKey = groupKey;
    customSizeInput = '';
    customSizeQty = 1;
  }

  function addCustomSizeToGroup() {
    if (!customSizeGroupKey) return;
    const g = groups.find((x) => x.groupKey === customSizeGroupKey);
    if (!g) return;
    const rawSz = normalizeSizeKey(customSizeInput);
    if (!rawSz || rawSz === '-') {
      app.toast('Enter a valid size between 1 and 50 (e.g. 6, 8, 35, 46).', 'warning');
      return;
    }
    const existing = g.lines.find((l) => normalizeSizeKey(l.size) === rawSz);
    if (existing) {
      existing.countedQty = Math.max(0, existing.countedQty + (Number(customSizeQty) || 0));
    } else {
      g.lines = sortLinesBySize([
        ...g.lines,
        {
          variantId: `custom_${g.groupKey}_${rawSz}_${Date.now()}`,
          productId: g.productId,
          sku: `${g.name}${rawSz.padStart(2, '0')}`,
          barcode: `${g.name}${rawSz.padStart(2, '0')}`,
          size: rawSz,
          displaySize: rawSz,
          colour: g.colour,
          sellingPrice: g.sellingPrice,
          costPrice: g.costPrice,
          systemStock: 0,
          countedQty: Math.max(0, Number(customSizeQty) || 0),
          isCustom: true,
        },
      ]);
    }
    customSizeGroupKey = null;
    SoundFx.scan();
    persistNow();
  }

  // ---------------- filtered groups in sheet ----------------
  const visibleGroups = $derived.by(() => {
    const q = sheetSearch.trim().toLowerCase();
    return groups.filter((g) => {
      if (q) {
        const mName = g.name.toLowerCase().includes(q);
        const mCol = (g.colour || '').toLowerCase().includes(q);
        const mBrand = g.brand.toLowerCase().includes(q);
        const mCat = g.category.toLowerCase().includes(q);
        const mSku = g.lines.some((l) => l.sku.toLowerCase().includes(q) || l.barcode.toLowerCase().includes(q));
        if (!mName && !mCol && !mBrand && !mCat && !mSku) return false;
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
    exportDetailedStockCountCSV(groups, locName, mode, sessionTitle, true);
    app.toast('Detailed Excel (CSV) downloaded!', 'success');
  }

  function handleExportMatrixCSV() {
    if (groups.length === 0) {
      app.toast('Add at least one shoe model to export Size-Matrix Excel.', 'warning');
      return;
    }
    exportMatrixStockCountCSV(groups, locName, mode, sessionTitle);
    app.toast('Excel (Sizes 1–50, blank for zero stock) downloaded!', 'success');
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
      persistNow();
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
        <div class="flex flex-wrap items-center gap-2">
          <span class="chip font-mono text-[10px] uppercase tracking-wider">Shop Stock Take & Excel Hub</span>
          <span class="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-ok">
            <CheckCircle2 class="h-3 w-3" />
            <span>Auto-Saved {lastSavedTime ? `(${lastSavedTime})` : ''} • Safe on Refresh</span>
          </span>
        </div>
        <h1 class="mt-1 font-display text-lg font-bold tracking-tight text-fg sm:text-xl">
          Shop Stock Count & Excel Sheet Builder (Sizes 1–50)
        </h1>
        <p class="mt-0.5 text-xs text-muted">
          Automatically splits Base SKU + Last 2 Digits as Size (`01–50`), merges repeat scans anywhere in the shop, and exports blank cells for zero stock.
        </p>
      </div>

      <!-- Top Quick Actions -->
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="btn btn-sm"
          onclick={saveCurrentAsSnapshot}
          disabled={groups.length === 0}
          title="Save a named backup snapshot of this sheet"
        >
          <BookmarkCheck class="h-3.5 w-3.5 text-ok" />
          <span>Save Backup Copy</span>
        </button>
        <button
          type="button"
          class="btn btn-sm"
          onclick={() => (snapshotsModalOpen = true)}
          title="View or reload saved stock count sheets"
        >
          <FolderClock class="h-3.5 w-3.5 text-muted" />
          <span>Saved Sheets ({snapshots.length})</span>
        </button>
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
            <span>Reset</span>
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
        <div class="text-[10px] font-semibold uppercase tracking-wider text-dim">Models / Colours</div>
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

  <!-- STEP 2: BARCODE SCANNER & MODEL SEARCH + QUICK 1-TAP SIZE & COLOUR BAR -->
  <section class="card p-4 sm:p-5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <ScanLine class="h-4 w-4 text-fg" />
        <h2 class="text-sm font-semibold text-fg">Scan Barcode (Last 2 Digits = Size) or Search Shoe Code</h2>
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
          class="btn btn-primary btn-sm"
          onclick={() => (cameraOpen = true)}
        >
          <Camera class="h-3.5 w-3.5" />
          <span>Camera Scan</span>
        </button>
      </div>
    </div>

    <!-- Search / Barcode Input -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="relative mt-3" role="search" onclick={(e) => e.stopPropagation()}>
      <div class="relative flex items-center">
        <Search class="pointer-events-none absolute left-3.5 h-4 w-4 text-dim" />
        <input
          bind:this={searchInput}
          type="text"
          class="input h-11 pl-10 pr-24 font-mono text-sm"
          placeholder="Scan barcode (e.g. SL10538 -> SKU: SL105, Size: 38) or type code..."
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
        {@const splitPreview = extractBaseSkuAndSize(debounced)}
        <div class="absolute left-0 right-0 z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl">
          {#if searchResults.length === 0}
            <div class="p-4 text-center">
              <p class="text-xs text-muted">
                Code: <b class="font-mono text-fg">{splitPreview.baseSku}</b>
                {#if splitPreview.size}
                  • Detected Size: <b class="font-mono text-ok">Sz {splitPreview.size}</b>
                {/if}
              </p>
              <div class="mt-2.5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  onclick={() => {
                    const code = debounced;
                    query = '';
                    debounced = '';
                    showResults = false;
                    processSmartScan(code, 1);
                  }}
                >
                  <Plus class="h-3.5 w-3.5" />
                  <span>
                    Count "{splitPreview.baseSku}"{splitPreview.size ? ` (Sz ${splitPreview.size}) +1` : ' (Sizes 36–45)'}
                  </span>
                </button>
                <button
                  type="button"
                  class="btn btn-sm"
                  onclick={() => { showResults = false; openManualModal(); }}
                >
                  <PackagePlus class="h-3.5 w-3.5" />
                  <span>Custom Details & Price</span>
                </button>
              </div>
            </div>
          {:else}
            <div class="divide-y divide-line">
              {#each searchResults as hit}
                {@const alreadyInSheet = groups.some((g) => g.name.toUpperCase() === hit.name.toUpperCase())}
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
                      {hit.variants.length} sizes • {fmtMoney(hit.sellingPrice)}
                      {#if hit.matchedSize}
                        • Scanned Size: <span class="font-mono font-bold text-ok">Sz {hit.matchedSize}</span>
                      {/if}
                    </div>
                  </div>
                  <div class="shrink-0 text-right">
                    <div class="font-mono text-xs font-bold text-fg">Sys: {hit.shopStock} prs</div>
                    <div class="mt-0.5 text-[11px] font-medium text-muted">Select →</div>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- ACTIVE DESIGN QUICK 1-TAP SIZE & COLOUR BAR -->
    {#if activeGroup}
      <div class="mt-3.5 rounded-xl border border-fg/30 bg-raised/60 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded bg-fg px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-bg">Active SKU</span>
            <span class="font-display text-sm font-bold text-fg">{activeGroup.name}</span>

            <!-- Colour Selector for Active Design -->
            <div class="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs">
              <Palette class="h-3.5 w-3.5 text-muted" />
              <select
                class="bg-transparent font-medium text-fg focus:outline-none cursor-pointer"
                bind:value={activeGroup.colour}
                onchange={() => persistNow()}
                aria-label="Active model colour"
              >
                {#each COMMON_SHOE_COLOURS as col}
                  <option class="bg-surface text-fg" value={col}>{col}</option>
                {/each}
              </select>
            </div>

            <!-- Add Another Colour of Same Code -->
            <button
              type="button"
              class="btn btn-sm h-7 px-2.5 text-[11px]"
              onclick={() => openAddColourModal(activeGroup.groupKey)}
              title="Count the same shoe code in another colour (e.g. Black vs Brown)"
            >
              <Palette class="h-3 w-3" />
              <span>+ Another Colour</span>
            </button>
          </div>

          <span class="text-[11px] text-muted">
            Tap any size below to add <b>+1 pair</b> to <b>{activeGroup.name}</b>:
          </span>
        </div>

        <!-- 1-Tap Size Buttons -->
        <div class="mt-2.5 flex flex-wrap gap-1.5">
          {#each activeGroup.lines as ln (ln.variantId)}
            <button
              type="button"
              class="flex min-w-[58px] flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-1.5 transition active:scale-95
                {ln.countedQty > 0
                  ? 'border-fg bg-fg text-bg shadow-xs'
                  : 'border-line bg-surface text-fg hover:border-fg/50'}"
              onclick={() => {
                ln.countedQty = Math.max(0, (Number(ln.countedQty) || 0) + 1);
                flashVariant(activeGroup.groupKey, ln.variantId);
              }}
            >
              <span class="font-mono text-[11px] font-semibold opacity-80">Sz {ln.size}</span>
              <span class="font-mono text-sm font-extrabold">{ln.countedQty}</span>
            </button>
          {/each}
          <button
            type="button"
            class="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line bg-surface/50 px-3 py-1.5 text-xs font-medium text-muted hover:border-fg hover:text-fg"
            onclick={() => openCustomSizeModal(activeGroup.groupKey)}
          >
            <Plus class="h-3.5 w-3.5" />
            <span class="text-[10px]">+ Size (1–50)</span>
          </button>
        </div>
      </div>
    {/if}
  </section>

  <!-- STEP 3: EXPORT EXCEL / PRINT / UPDATE BAR + STOCK COUNT SHEET -->
  <section class="card p-4 sm:p-5">
    <div class="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 class="text-sm font-semibold text-fg">
          3. Counted Stock Sheet ({groups.length} {groups.length === 1 ? 'Model Row' : 'Model Rows'})
        </h2>
        <p class="text-xs text-muted">
          Excel Matrix exports Sizes 1–50 with blank cells (never 0) for uncounted sizes.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          onclick={handleExportMatrixCSV}
          disabled={groups.length === 0}
          title="Download Horizontal Size-Matrix Excel CSV (Sizes 1 to 50 as columns, empty cells for zero stock)"
        >
          <Table class="h-3.5 w-3.5" />
          <span>Excel (Sizes 1–50 Matrix)</span>
        </button>

        <button
          type="button"
          class="btn btn-sm font-semibold"
          onclick={handleExportDetailedCSV}
          disabled={groups.length === 0}
          title="Download Detailed SKU/Barcode Excel CSV"
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
            placeholder="Filter by code or colour..."
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
          Scan a shoe barcode above (last 2 digits automatically set the size), search a model code, or load existing shop stock.
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
        {#each visibleGroups as g (g.groupKey)}
          {@const modelSys = g.lines.reduce((s, l) => s + (Number(l.systemStock) || 0), 0)}
          {@const modelCnt = g.lines.reduce((s, l) => s + (Number(l.countedQty) || 0), 0)}
          {@const modelDiff = mode === 'audit' ? modelCnt - modelSys : modelCnt}
          {@const isActive = activeGroupKey === g.groupKey}

          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="rounded-xl border transition {isActive ? 'border-fg/60 bg-raised/40' : 'border-line bg-raised/20'} p-3.5 sm:p-4"
            onclick={() => (activeGroupKey = g.groupKey)}
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
                      placeholder="Base Model SKU"
                      title="Edit base model SKU"
                    />
                  {:else}
                    <span class="font-display text-base font-bold text-fg">{g.name}</span>
                  {/if}

                  <!-- Colour Dropdown on Card -->
                  <div class="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-xs">
                    <Palette class="h-3 w-3 text-muted" />
                    <select
                      class="bg-transparent font-semibold text-fg focus:outline-none cursor-pointer"
                      bind:value={g.colour}
                      onchange={() => {
                        for (const ln of g.lines) ln.colour = g.colour;
                        persistNow();
                      }}
                      aria-label="Colour for {g.name}"
                    >
                      {#each COMMON_SHOE_COLOURS as col}
                        <option class="bg-surface text-fg" value={col}>{col}</option>
                      {/each}
                      {#if g.colour && !COMMON_SHOE_COLOURS.includes(g.colour)}
                        <option class="bg-surface text-fg" value={g.colour}>{g.colour}</option>
                      {/if}
                    </select>
                  </div>

                  {#if g.isCustomModel}
                    <span class="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-warn">
                      Unlisted
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
                      />
                    </div>
                  {:else}
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
                <button
                  type="button"
                  class="btn btn-sm text-[11px]"
                  onclick={(e) => { e.stopPropagation(); openAddColourModal(g.groupKey); }}
                  title="Add the same shoe code in another colour (e.g. Black, Brown, Tan)"
                >
                  <Palette class="h-3 w-3" />
                  <span>+ Colour</span>
                </button>
                {#if !g.isCustomModel}
                  <button
                    type="button"
                    class="btn btn-sm text-[11px]"
                    onclick={(e) => { e.stopPropagation(); copySystemToCountedForGroup(g); }}
                    title="Copy system stock into counted boxes for this model"
                  >
                    <Copy class="h-3 w-3" />
                    <span>Match Sys</span>
                  </button>
                {/if}
                <button
                  type="button"
                  class="btn btn-sm text-[11px]"
                  onclick={(e) => { e.stopPropagation(); openCustomSizeModal(g.groupKey); }}
                  title="Add another size (1 to 50) to this shoe model"
                >
                  <Plus class="h-3 w-3" />
                  <span>+ Size</span>
                </button>
                <button
                  type="button"
                  class="btn btn-sm text-[11px] text-muted hover:text-fg"
                  onclick={(e) => { e.stopPropagation(); zeroGroupCounts(g); }}
                  title="Reset all sizes of this model to 0"
                >
                  <span>Zero</span>
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm text-dim hover:text-bad"
                  onclick={(e) => { e.stopPropagation(); removeGroup(g.groupKey); }}
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
                            line.displaySize = normalizeSizeKey(line.size);
                          }}
                          placeholder="1-50"
                          title="Size (1 to 50)"
                        />
                      </div>
                    {:else}
                      <span class="font-mono text-xs font-bold text-fg">Sz {line.size}</span>
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
                      aria-label="Decrease size {line.size}"
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
                      aria-label="Increase size {line.size}"
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

<!-- ADD ANOTHER COLOUR OF SAME MODEL MODAL -->
{#if colourModalGroupKey}
  {@const targetGrp = groups.find((g) => g.groupKey === colourModalGroupKey)}
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-xs sm:items-center sm:p-4">
    <div class="card w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl">
      <div class="flex items-center justify-between border-b border-line pb-3">
        <div>
          <h3 class="text-sm font-bold text-fg">Add Another Colour for "{targetGrp?.name}"</h3>
          <p class="text-xs text-muted">Creates a separate size-matrix row for the new colour.</p>
        </div>
        <button class="btn btn-ghost btn-sm" onclick={() => (colourModalGroupKey = null)}>
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="mt-3">
        <span class="label">Tap a Colour to Create Row Immediately:</span>
        <div class="mt-1.5 grid grid-cols-3 gap-2">
          {#each COMMON_SHOE_COLOURS.filter((c) => c !== 'All / Default') as col}
            <button
              type="button"
              class="btn btn-sm justify-center font-medium"
              onclick={() => createColourVariantGroup(col)}
            >
              {col}
            </button>
          {/each}
        </div>
      </div>

      <div class="mt-4 border-t border-line pt-3">
        <label class="label" for="customColInput">Or Type Custom Colour Name:</label>
        <div class="flex gap-2">
          <input
            id="customColInput"
            type="text"
            class="input flex-1"
            placeholder="e.g. Camel / Navy Blue / Cream"
            bind:value={customColourText}
            onkeydown={(e) => e.key === 'Enter' && createColourVariantGroup(customColourText)}
          />
          <button
            type="button"
            class="btn btn-primary"
            onclick={() => createColourVariantGroup(customColourText)}
          >
            Add Colour
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- SAVED SHEETS / SNAPSHOTS MODAL -->
{#if snapshotsModalOpen}
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-xs sm:items-center sm:p-4">
    <div class="card max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl">
      <div class="flex items-center justify-between border-b border-line pb-3">
        <div>
          <h3 class="text-sm font-bold text-fg">Saved Stock Count Sheets ({snapshots.length})</h3>
          <p class="text-xs text-muted">Reload a previous count sheet or download its Excel file anytime.</p>
        </div>
        <button class="btn btn-ghost btn-sm" onclick={() => (snapshotsModalOpen = false)}>
          <X class="h-4 w-4" />
        </button>
      </div>

      {#if snapshots.length === 0}
        <p class="py-8 text-center text-xs text-muted">
          No saved backup sheets yet. Click "Save Backup Copy" at the top to save snapshots.
        </p>
      {:else}
        <div class="mt-3 divide-y divide-line">
          {#each snapshots as s (s.id)}
            <div class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <div class="truncate text-xs font-bold text-fg">{s.title}</div>
                <div class="font-mono text-[11px] text-dim">
                  {s.locationName} • {s.totalModels} models • {s.totalPairs} pairs • {s.savedAt}
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  class="btn btn-primary btn-sm text-[11px]"
                  onclick={() => restoreSnapshot(s)}
                >
                  Open
                </button>
                <button
                  type="button"
                  class="btn btn-sm text-[11px]"
                  onclick={() => exportMatrixStockCountCSV(s.groups, s.locationName, s.mode, s.title)}
                  title="Download Matrix Excel (Sizes 1-50)"
                >
                  <Download class="h-3.5 w-3.5" />
                  <span>Excel</span>
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm text-dim hover:text-bad"
                  onclick={() => removeSnapshot(s.id)}
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
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
        <div>
          <label class="label" for="manualModelCode">Shoe Code / Model Name *</label>
          <input
            id="manualModelCode"
            type="text"
            class="input"
            placeholder="e.g. SFW-NEW-01"
            bind:value={manualName}
          />
        </div>
        <div>
          <label class="label" for="manualColourSelect">Colour</label>
          <select id="manualColourSelect" class="input" bind:value={manualColour}>
            {#each COMMON_SHOE_COLOURS as col}
              <option value={col}>{col}</option>
            {/each}
          </select>
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
{#if customSizeGroupKey !== null}
  {@const targetGrp = groups.find((x) => x.groupKey === customSizeGroupKey)}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
    <div class="card w-full max-w-sm p-5">
      <div class="flex items-center justify-between border-b border-line pb-3">
        <h3 class="text-sm font-bold text-fg">Add Size (1–50) to {targetGrp?.name}</h3>
        <button class="btn btn-ghost btn-sm" onclick={() => (customSizeGroupKey = null)}>
          <X class="h-4 w-4" />
        </button>
      </div>
      <div class="mt-4 space-y-3">
        <div>
          <label class="label" for="customSzInput">Shoe Size (1 to 50)</label>
          <input
            id="customSzInput"
            type="number"
            min="1"
            max="50"
            class="input font-mono"
            placeholder="e.g. 6, 8, 28, 35, 46"
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
        <button class="btn" onclick={() => (customSizeGroupKey = null)}>Cancel</button>
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
