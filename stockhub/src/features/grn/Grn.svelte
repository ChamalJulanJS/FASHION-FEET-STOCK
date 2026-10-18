<script lang="ts">
  import { onMount } from 'svelte';
  import {
    PackagePlus, Package, Search, X, Camera, Zap, Plus, Minus, Trash2,
    RefreshCw, AlertCircle, AlertTriangle, Check, ChevronDown, ChevronUp,
    ChevronLeft, ChevronRight, Pencil, Copy, CircleCheckBig, Loader2,
    Store, Truck, Calendar, FileText, History, Sparkles, WandSparkles,
  } from 'lucide-svelte';
  import { app, getShoeDisplaySize, fmtMoney } from '../../lib/app.svelte';
  import { restGet, restWrite } from '../../lib/api';
  import { SoundFx } from '../../lib/sound';
  import type { Variant } from '../../lib/types';
  import { extractBaseSkuAndSize } from '../stockcount/logic';
  import CameraScanner from '../transfer/CameraScanner.svelte';

  const OPENING_CAPITAL_SUPPLIER_ID = '00000000-0000-0000-0000-000000000001';

  interface Supplier {
    id: string;
    name: string;
    phone?: string;
    email?: string;
  }

  interface GrnLineItem {
    id: string; // variant_id
    product_id: string;
    name: string;
    brand: string;
    category: string;
    gender: string;
    sku: string;
    size: string;
    colour: string;
    barcode: string;
    selling_price: number;
    cost_price: number;
    quantity_received: number;
    unit_cost: number;
    line_cost: number;
  }

  interface GrnGroup {
    key: string;
    productId: string;
    name: string;
    brand: string;
    items: GrnLineItem[];
    unitCost: number;
    sellPrice: number;
    costMismatch: boolean;
    priceMismatch: boolean;
    totalQty: number;
    totalCost: number;
  }

  // ---------------- active sub-view ----------------
  let viewMode = $state<'receive' | 'history'>('receive');

  // ---------------- GRN Receive / Draft state ----------------
  let suppliers = $state<Supplier[]>([]);
  let supplierId = $state('');
  let locationId = $state('');
  let referenceNo = $state('');
  let notes = $state('');
  let grnDate = $state(new Date().toISOString().split('T')[0]);
  let discount = $state<number>(0);
  let grnItems = $state<GrnLineItem[]>([]);
  let isProcessing = $state(false);
  let draftGrnId = $state<string | null>(null);

  // Opening Capital Batch Import state
  let batchRefs = $state<string[]>([]);
  let selectedBatchRef = $state('');
  let loadingBatch = $state(false);

  // Per-size cost override & mismatch review popover state
  let perSizeCostKeys = $state<Record<string, boolean>>({});
  let mismatchPopoverKey = $state<string | null>(null);
  let customSyncCost = $state('');

  // Search & Scanner state
  let searchQuery = $state('');
  let debouncedQuery = $state('');
  let showSearchDropdown = $state(false);
  let cameraOpen = $state(false);
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Quick Add New Supplier Modal
  let newSupplierOpen = $state(false);
  let newSupplierName = $state('');
  let newSupplierPhone = $state('');
  let newSupplierBusy = $state(false);

  // Add New Product (Catalog Registration) Modal (100% Desktop POS Inventory Parity)
  let newProductOpen = $state(false);
  let npName = $state('');
  let npBrand = $state('');
  let npCategory = $state('Casual');
  let npGender = $state('unisex');
  let npDescription = $state('');
  let npAddToGrn = $state(true);
  let npVariants = $state<
    { sku: string; size: string; colour: string; cost_price: string; selling_price: string; barcode: string; qty: string }[]
  >([{ sku: '', size: '', colour: '', cost_price: '', selling_price: '', barcode: '', qty: '1' }]);
  let npBusy = $state(false);
  let dbBrands = $state<string[]>([]);
  let dbCategories = $state<string[]>([]);
  let addingBrandInline = $state(false);
  let inlineBrandName = $state('');
  let addingCategoryInline = $state(false);
  let inlineCategoryName = $state('');

  // ---------------- GRN History state ----------------
  let historyList = $state<any[]>([]);
  let historyTotalCount = $state(0);
  let historyPage = $state(1);
  let historyLoading = $state(false);
  let historySearch = $state('');
  let historyLocationFilter = $state('all');
  let historyDateFilter = $state<'all' | 'today' | 'week' | 'month'>('all');
  let expandedGrnId = $state<string | null>(null);
  let expandedGrnItems = $state<any[]>([]);
  let loadingExpandedItems = $state(false);
  let confirmingGrnId = $state<string | null>(null);
  let deletingGrnId = $state<string | null>(null);

  // Edit Confirmed GRN Metadata Modal (`y` in 0ab~__-~_vdob.js)
  let editMetaGrn = $state<any | null>(null);
  let editMetaRef = $state('');
  let editMetaDate = $state('');
  let editMetaDiscount = $state(0);
  let editMetaNotes = $state('');
  let editMetaBusy = $state(false);

  const PAGE_SIZE = 15;
  const totalPages = $derived(Math.max(1, Math.ceil(historyTotalCount / PAGE_SIZE)));

  // Merged brands and categories
  const allBrands = $derived.by(() => {
    const s = new Set<string>(dbBrands);
    for (const v of app.catalog) {
      if (v.products?.brand) s.add(v.products.brand);
    }
    return Array.from(s).filter(Boolean).sort((a, b) => a.localeCompare(b));
  });

  const allCategories = $derived.by(() => {
    const s = new Set<string>(
      dbCategories.length > 0
        ? dbCategories
        : ['Casual', 'Formal', 'Sports', 'Sandals', 'Slippers', 'Kids', 'Ladies', 'Gents'],
    );
    for (const v of app.catalog) {
      if (v.products?.category) s.add(v.products.category);
    }
    return Array.from(s).filter(Boolean).sort((a, b) => a.localeCompare(b));
  });

  // ---------------- lifecycle ----------------
  async function loadInitialGrnData() {
    try {
      const [supRes, bRes, cRes] = await Promise.all([
        restGet<Supplier[]>('suppliers?select=id,name,phone,email&order=name.asc'),
        restGet<{ name: string }[]>('brands?select=name&order=name.asc'),
        restGet<{ name: string }[]>('categories?select=name&order=name.asc'),
      ]);
      if (supRes) suppliers = supRes;
      if (bRes) dbBrands = bRes.map((b) => b.name).filter(Boolean);
      if (cRes) dbCategories = cRes.map((c) => c.name).filter(Boolean);
    } catch (e) {
      console.warn('Failed to load GRN metadata:', e);
    }
  }

  onMount(() => {
    loadInitialGrnData();
    fetchGrnHistory();

    // Hardware barcode scanner listener when on GRN Receive tab (exact parity with Desktop POS)
    let scanBuf = '';
    let lastKeyTime = Date.now();
    const onKeyDown = (e: KeyboardEvent) => {
      if (app.tab !== 'grn' || viewMode !== 'receive' || cameraOpen || newProductOpen || newSupplierOpen) return;
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
      if (isInput && Date.now() - lastKeyTime > 50) return;

      const now = Date.now();
      if (now - lastKeyTime > 100) scanBuf = '';
      if (e.key === 'Enter') {
        if (scanBuf.length > 3) {
          const code = scanBuf.trim();
          scanBuf = '';
          e.preventDefault();
          handleBarcodeScan(code);
        }
        scanBuf = '';
      } else if (e.key.length === 1) {
        scanBuf += e.key;
      }
      lastKeyTime = now;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Default locationId to user's branch or first location
  $effect(() => {
    if (!locationId && app.locations.length > 0) {
      if (app.currentUser?.location_id) {
        locationId = app.currentUser.location_id;
      } else {
        const ho = app.locations.find((l) => app.isWarehouse(l));
        locationId = ho?.id || app.locations[0].id;
      }
    }
  });

  // Load Opening Capital batch_refs when supplierId === OPENING_CAPITAL_SUPPLIER_ID
  $effect(() => {
    if (supplierId === OPENING_CAPITAL_SUPPLIER_ID) {
      restGet<{ batch_ref: string }[]>('products?batch_ref=not.is.null&select=batch_ref&order=batch_ref.asc')
        .then((rows) => {
          const unique = Array.from(new Set((rows || []).map((r) => r.batch_ref).filter(Boolean)));
          batchRefs = unique;
        })
        .catch(() => {
          batchRefs = [];
        });
    } else {
      batchRefs = [];
      selectedBatchRef = '';
    }
  });

  // ---------------- search & grouping ----------------
  function runGrnSearch(raw: string): Variant[] {
    if (!raw || raw.trim().length < 2) return [];
    const q = raw.trim().toUpperCase();
    const { baseSku } = extractBaseSkuAndSize(q);
    const b = (baseSku || '').trim().toUpperCase();

    const matches = app.catalog.filter((v) => {
      const barcodeMatch = v.barcode && v.barcode.toUpperCase() === q;
      const skuMatch =
        v.sku && (v.sku.toUpperCase().includes(q) || (b.length >= 2 && v.sku.toUpperCase().includes(b)));
      const nameMatch =
        v.products?.name &&
        (v.products.name.toUpperCase().includes(q) ||
          (b.length >= 2 && v.products.name.toUpperCase().includes(b)));
      const brandMatch = v.products?.brand && v.products.brand.toUpperCase().includes(q);
      const colourMatch = v.colour && v.colour.toUpperCase().includes(q);
      const dispSz = getShoeDisplaySize(v.size, v.products);
      const sizeMatch = (v.size && v.size.toString().trim() === q) || dispSz.toUpperCase().includes(q);
      return barcodeMatch || skuMatch || nameMatch || brandMatch || colourMatch || sizeMatch;
    });

    return matches.slice(0, 40);
  }

  const searchResults = $derived(runGrnSearch(debouncedQuery));

  // Group search results by product name (exact parity with Desktop POS `ee` in 0ql7oe6iu_bx3.js)
  const groupedSearchResults = $derived.by(() => {
    const map = new Map<string, Variant[]>();
    for (const v of searchResults) {
      const pName = v.products?.name || v.sku || 'Product';
      if (!map.has(pName)) map.set(pName, []);
      map.get(pName)!.push(v);
    }
    return Array.from(map.entries()).map(([name, variants]) => ({
      name,
      variants: [...variants].sort((a, b) => {
        const na = parseFloat(String(a.size || ''));
        const nb = parseFloat(String(b.size || ''));
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return String(a.size || '').localeCompare(String(b.size || ''));
      }),
    }));
  });

  function onSearchInput() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      debouncedQuery = searchQuery;
      showSearchDropdown = debouncedQuery.trim().length >= 2;
    }, 150);
  }

  function resetSearch() {
    searchQuery = '';
    debouncedQuery = '';
    showSearchDropdown = false;
  }

  function variantToGrnItem(v: Variant, qty = 1): GrnLineItem {
    const cost = Number(v.cost_price) || 0;
    const sell = Number(v.selling_price) || 0;
    return {
      id: v.id,
      product_id: v.product_id || v.products?.id || '',
      name: v.products?.name || v.sku || 'Footwear',
      brand: v.products?.brand || '',
      category: v.products?.category || '',
      gender: (v.products as any)?.gender || '',
      sku: v.sku || '',
      size: String(v.size || ''),
      colour: v.colour || '',
      barcode: v.barcode || '',
      selling_price: sell,
      cost_price: cost,
      quantity_received: qty,
      unit_cost: cost,
      line_cost: qty * cost,
    };
  }

  function addVariantToGrn(v: Variant, qty = 1, silent = false) {
    const existingIdx = grnItems.findIndex((it) => it.id === v.id);
    if (existingIdx >= 0) {
      const nextQty = Number(grnItems[existingIdx].quantity_received) + qty;
      grnItems[existingIdx].quantity_received = nextQty;
      grnItems[existingIdx].line_cost = nextQty * Number(grnItems[existingIdx].unit_cost);
    } else {
      grnItems.push(variantToGrnItem(v, qty));
    }
    if (!silent) {
      SoundFx.scan();
      const dispSz = getShoeDisplaySize(v.size, v.products);
      app.toast(`Added to GRN: ${v.products?.name || v.sku} (Sz ${dispSz})`, 'success');
    }
  }

  function addAllVariantsToGrn(variants: Variant[]) {
    for (const v of variants) {
      addVariantToGrn(v, 1, true);
    }
    SoundFx.scan();
    app.toast(`Added ${variants.length} size variant(s) to shipment!`, 'success');
    resetSearch();
  }

  function handleBarcodeScan(raw: string) {
    if (!raw || !raw.trim()) return;
    cameraOpen = false;
    const q = raw.trim().toUpperCase();

    const exact = app.catalog.find(
      (v) => (v.barcode && v.barcode.toUpperCase() === q) || (v.sku && v.sku.toUpperCase() === q),
    );
    if (exact) {
      addVariantToGrn(exact, 1);
      resetSearch();
      return;
    }

    const { baseSku, size } = extractBaseSkuAndSize(raw);
    if (baseSku && size) {
      const bUpper = baseSku.toUpperCase();
      const matchBySize = app.catalog.find((v) => {
        const skuMatch =
          (v.sku && v.sku.toUpperCase() === bUpper) ||
          (v.sku && v.sku.toUpperCase().startsWith(bUpper)) ||
          (v.products?.name && v.products.name.toUpperCase() === bUpper);
        const vSz = String(v.size || '').trim();
        const dispSz = getShoeDisplaySize(v.size, v.products, 'uk_only');
        return skuMatch && (vSz === size || dispSz === size);
      });
      if (matchBySize) {
        addVariantToGrn(matchBySize, 1);
        resetSearch();
        return;
      }
    }

    const found = runGrnSearch(raw);
    if (found.length === 1) {
      addVariantToGrn(found[0], 1);
      resetSearch();
      return;
    }

    if (found.length > 1) {
      searchQuery = raw;
      debouncedQuery = raw;
      showSearchDropdown = true;
      SoundFx.scan();
      return;
    }

    // Offer to register new product in catalog & add to GRN
    openNewProductModal(baseSku || raw.trim(), size || '', raw.trim());
    SoundFx.warning();
    app.toast(`"${raw.trim()}" not in catalog — Register New Product opened!`, 'warning');
  }

  // Grouped items in shipment (`eC` in 0ql7oe6iu_bx3.js)
  const groupedShipment = $derived.by<GrnGroup[]>(() => {
    const map = new Map<string, GrnLineItem[]>();
    for (const it of grnItems) {
      const k = it.name || it.sku;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      const costs = new Set(items.map((i) => String(i.unit_cost)));
      const prices = new Set(items.map((i) => String(i.selling_price)));
      const totalQty = items.reduce((s, i) => s + (Number(i.quantity_received) || 0), 0);
      const totalCost = items.reduce(
        (s, i) => s + (Number(i.quantity_received) || 0) * (Number(i.unit_cost) || 0),
        0,
      );
      return {
        key,
        productId: items[0].product_id,
        name: key,
        brand: items[0].brand,
        items,
        unitCost: items[0].unit_cost,
        sellPrice: items[0].selling_price,
        costMismatch: costs.size > 1,
        priceMismatch: prices.size > 1,
        totalQty,
        totalCost,
      };
    });
  });

  const subtotalCost = $derived(
    grnItems.reduce((s, it) => s + (Number(it.unit_cost) || 0) * (Number(it.quantity_received) || 0), 0),
  );
  const netTotalCost = $derived(Math.max(0, subtotalCost - (Number(discount) || 0)));
  const totalPairsInGrn = $derived(
    grnItems.reduce((s, it) => s + (Number(it.quantity_received) || 0), 0),
  );

  // Update individual variant field (`eb` in 0ql7oe6iu_bx3.js)
  function updateItemField(variantId: string, field: 'quantity_received' | 'unit_cost' | 'line_cost', value: number | string) {
    const idx = grnItems.findIndex((it) => it.id === variantId);
    if (idx < 0) return;
    const numVal = Math.max(0, Number(value) || 0);
    if (field === 'quantity_received') {
      const q = Math.max(1, Math.round(numVal));
      grnItems[idx].quantity_received = q;
      grnItems[idx].line_cost = q * Number(grnItems[idx].unit_cost);
    } else if (field === 'unit_cost') {
      grnItems[idx].unit_cost = numVal;
      grnItems[idx].line_cost = Number(grnItems[idx].quantity_received) * numVal;
    } else if (field === 'line_cost') {
      grnItems[idx].line_cost = numVal;
      const q = Number(grnItems[idx].quantity_received);
      grnItems[idx].unit_cost = q > 0 ? numVal / q : 0;
    }
  }

  // Update shared group field across all sizes of a product (`ej` in 0ql7oe6iu_bx3.js)
  function updateGroupField(groupKey: string, field: 'unit_cost' | 'selling_price', value: number | string) {
    const numVal = Math.max(0, Number(value) || 0);
    for (const it of grnItems) {
      if ((it.name || it.sku) === groupKey) {
        if (field === 'unit_cost') {
          it.unit_cost = numVal;
          it.line_cost = Number(it.quantity_received) * numVal;
        } else if (field === 'selling_price') {
          it.selling_price = numVal;
        }
      }
    }
  }

  function togglePerSizeCost(groupKey: string) {
    perSizeCostKeys[groupKey] = !perSizeCostKeys[groupKey];
  }

  function removeVariantFromGrn(variantId: string) {
    grnItems = grnItems.filter((it) => it.id !== variantId);
  }

  function removeGroupFromGrn(groupKey: string) {
    grnItems = grnItems.filter((it) => (it.name || it.sku) !== groupKey);
  }

  // Find other sizes of a product not yet added to the shipment
  function getUnaddedSiblingsForGroup(group: GrnGroup): Variant[] {
    if (!group.productId) return [];
    const allSibs = app.productsMap.get(group.productId) || [];
    const inGrnIds = new Set(group.items.map((i) => i.id));
    return allSibs.filter((s) => !inGrnIds.has(s.id));
  }

  // Add Opening Capital Batch (`ew` in 0ql7oe6iu_bx3.js)
  async function addBatchProductsToGrn() {
    if (!selectedBatchRef) return;
    loadingBatch = true;
    try {
      const prods = await restGet<{ id: string }[]>(
        `products?batch_ref=eq.${encodeURIComponent(selectedBatchRef)}&select=id`,
      );
      if (!prods || prods.length === 0) {
        app.toast('No products found for this batch', 'warning');
        return;
      }
      const prodIds = new Set(prods.map((p) => p.id));
      const matchingVariants = app.catalog.filter((v) => prodIds.has(v.product_id || v.products?.id || ''));
      if (matchingVariants.length === 0) {
        app.toast('No variants found for this batch', 'warning');
        return;
      }
      const existingIds = new Set(grnItems.map((it) => it.id));
      let addedCount = 0;
      for (const v of matchingVariants) {
        if (!existingIds.has(v.id)) {
          grnItems.push(variantToGrnItem(v, 1));
          addedCount++;
        }
      }
      SoundFx.success();
      app.toast(`Added ${addedCount} variant(s) from "${selectedBatchRef}"`, 'success');
    } catch (e: any) {
      app.toast('Failed to load batch products: ' + (e.message || 'Error'), 'error');
    } finally {
      loadingBatch = false;
    }
  }

  function resetGrnForm() {
    draftGrnId = null;
    supplierId = '';
    referenceNo = '';
    notes = '';
    grnDate = new Date().toISOString().split('T')[0];
    discount = 0;
    grnItems = [];
    perSizeCostKeys = {};
  }

  // ---------------- Confirm & Add to Stock (`eN` in 0ql7oe6iu_bx3.js) ----------------
  async function confirmAndAddGrnToStock() {
    if (!supplierId) {
      app.toast('Please select a supplier / vendor', 'warning');
      SoundFx.warning();
      return;
    }
    if (!locationId) {
      app.toast('Please select a destination receiving branch', 'warning');
      SoundFx.warning();
      return;
    }
    if (grnItems.length === 0) {
      app.toast('Please add at least one item to the shipment', 'warning');
      SoundFx.warning();
      return;
    }
    if (!app.currentUser) {
      app.toast('Please sign in to process a GRN.', 'warning');
      app.openLogin(false);
      return;
    }

    isProcessing = true;
    try {
      const receivedAtIso = grnDate ? new Date(grnDate).toISOString() : new Date().toISOString();
      const isOpeningCapital = supplierId === OPENING_CAPITAL_SUPPLIER_ID;
      let finalGrnId = draftGrnId;

      // 1. Create or Update GRN record with status="confirmed"
      if (finalGrnId) {
        await restWrite('DELETE', `grn_items?grn_id=eq.${finalGrnId}`);
        await restWrite('PATCH', `grns?id=eq.${finalGrnId}`, {
          supplier_id: supplierId,
          location_id: locationId,
          reference_no: referenceNo.trim() || null,
          notes: notes.trim() || null,
          received_by: app.currentUser.id,
          received_at: receivedAtIso,
          discount: Number(discount) || 0,
          status: 'confirmed',
        });
      } else {
        const createdGrn = await restWrite<any[]>('POST', 'grns', {
          supplier_id: supplierId,
          location_id: locationId,
          reference_no: referenceNo.trim() || null,
          notes: notes.trim() || null,
          received_by: app.currentUser.id,
          received_at: receivedAtIso,
          discount: Number(discount) || 0,
          status: 'confirmed',
        });
        const grnRow = Array.isArray(createdGrn) ? createdGrn[0] : createdGrn;
        if (!grnRow?.id) throw new Error('Failed to create GRN record');
        finalGrnId = grnRow.id;
      }

      // 2. Create Supplier Invoice if not Opening Capital
      if (!isOpeningCapital) {
        await restWrite('POST', 'supplier_invoices', {
          grn_id: finalGrnId,
          supplier_id: supplierId,
          location_id: locationId,
          reference_no: referenceNo.trim() || null,
          total_amount: netTotalCost,
          status: 'unpaid',
        });
      }

      // 3. Process each item: insert grn_items, update product_variants, update stock_levels, insert stock_movements
      for (const item of grnItems) {
        const qty = Math.max(1, parseInt(String(item.quantity_received)) || 1);
        const uCost = parseFloat(String(item.unit_cost)) || 0;
        const sPrice = parseFloat(String(item.selling_price)) || 0;

        await restWrite('POST', 'grn_items', {
          grn_id: finalGrnId,
          variant_id: item.id,
          quantity_received: qty,
          unit_cost: uCost,
        });

        const variantPatch: Record<string, any> = { cost_price: uCost };
        if (sPrice > 0) variantPatch.selling_price = sPrice;
        await restWrite('PATCH', `product_variants?id=eq.${item.id}`, variantPatch);

        // Update local catalog variant pricing
        const catVar = app.catalog.find((v) => v.id === item.id);
        if (catVar) {
          catVar.cost_price = uCost;
          if (sPrice > 0) catVar.selling_price = sPrice;
        }

        // Update stock_levels for locationId
        const existingStock = await restGet<{ id: string; quantity: number }[]>(
          `stock_levels?variant_id=eq.${item.id}&location_id=eq.${locationId}&select=id,quantity`,
        );
        let newQty = qty;
        if (existingStock && existingStock.length > 0) {
          newQty = Number(existingStock[0].quantity) + qty;
          await restWrite('PATCH', `stock_levels?id=eq.${existingStock[0].id}`, {
            quantity: newQty,
          });
        } else {
          await restWrite('POST', 'stock_levels', {
            variant_id: item.id,
            location_id: locationId,
            quantity: newQty,
          });
        }
        app.stockMap.set(`${item.id}_${locationId}`, newQty);

        // Insert stock_movements
        await restWrite('POST', 'stock_movements', {
          variant_id: item.id,
          to_location: locationId,
          quantity: qty,
          type: 'purchase_receiving',
          grn_id: finalGrnId,
          created_by: app.currentUser.id,
        });
      }

      app.syncVersion++;
      SoundFx.success();
      app.toast('GRN processed successfully! Stock levels updated.', 'success');
      resetGrnForm();
      fetchGrnHistory();
      viewMode = 'history';
    } catch (e: any) {
      console.error('GRN processing failed:', e);
      SoundFx.error();
      app.toast('GRN failed: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      isProcessing = false;
    }
  }

  // ---------------- Save as Draft (`e_` in 0ql7oe6iu_bx3.js) ----------------
  async function saveGrnAsDraft() {
    if (!locationId) {
      app.toast('Please select a destination location', 'warning');
      return;
    }
    if (grnItems.length === 0) {
      app.toast('Please add at least one item', 'warning');
      return;
    }
    if (!app.currentUser) {
      app.toast('Please sign in to save a draft GRN.', 'warning');
      app.openLogin(false);
      return;
    }

    isProcessing = true;
    try {
      const receivedAtIso = grnDate ? new Date(grnDate).toISOString() : new Date().toISOString();
      let targetGrnId = draftGrnId;
      const isEditing = Boolean(targetGrnId);

      if (targetGrnId) {
        await restWrite('DELETE', `grn_items?grn_id=eq.${targetGrnId}`);
        await restWrite('PATCH', `grns?id=eq.${targetGrnId}`, {
          supplier_id: supplierId || null,
          location_id: locationId,
          reference_no: referenceNo.trim() || null,
          notes: notes.trim() || null,
          received_by: app.currentUser.id,
          received_at: receivedAtIso,
          discount: Number(discount) || 0,
          status: 'draft',
        });
      } else {
        const created = await restWrite<any[]>('POST', 'grns', {
          supplier_id: supplierId || null,
          location_id: locationId,
          reference_no: referenceNo.trim() || null,
          notes: notes.trim() || null,
          received_by: app.currentUser.id,
          received_at: receivedAtIso,
          discount: Number(discount) || 0,
          status: 'draft',
        });
        const row = Array.isArray(created) ? created[0] : created;
        if (!row?.id) throw new Error('Failed to create draft GRN');
        targetGrnId = row.id;
      }

      const itemsPayload = grnItems.map((it) => ({
        grn_id: targetGrnId,
        variant_id: it.id,
        quantity_received: Math.max(1, parseInt(String(it.quantity_received)) || 1),
        unit_cost: parseFloat(String(it.unit_cost)) || 0,
      }));
      await restWrite('POST', 'grn_items', itemsPayload);

      SoundFx.success();
      app.toast(isEditing ? 'Draft updated!' : 'Draft GRN saved!', 'success');
      resetGrnForm();
      fetchGrnHistory();
      viewMode = 'history';
    } catch (e: any) {
      app.toast('Failed to save draft: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      isProcessing = false;
    }
  }

  // ---------------- Load Draft into Editor (exact parity with `?draft=` in 0ql7oe6iu_bx3.js) ----------------
  async function loadDraftGrnForEditing(grnRecord: any) {
    isProcessing = true;
    try {
      draftGrnId = grnRecord.id;
      supplierId = grnRecord.supplier_id || '';
      locationId = grnRecord.location_id || locationId;
      referenceNo = grnRecord.reference_no || '';
      notes = grnRecord.notes || '';
      grnDate = grnRecord.received_at ? grnRecord.received_at.split('T')[0] : new Date().toISOString().split('T')[0];
      discount = Number(grnRecord.discount || 0);

      const items = await restGet<any[]>(
        `grn_items?grn_id=eq.${grnRecord.id}&select=id,variant_id,quantity_received,unit_cost,product_variants(id,sku,size,colour,selling_price,cost_price,barcode,product_id,products(id,name,brand,category,gender))`,
      );
      if (items && items.length > 0) {
        grnItems = items.map((it) => {
          const pv = Array.isArray(it.product_variants) ? it.product_variants[0] : it.product_variants;
          const prod = pv?.products ? (Array.isArray(pv.products) ? pv.products[0] : pv.products) : null;
          const catVar = app.catalog.find((v) => v.id === it.variant_id);
          const qty = Number(it.quantity_received) || 1;
          const uCost = Number(it.unit_cost) || 0;
          return {
            id: it.variant_id,
            product_id: pv?.product_id || prod?.id || catVar?.product_id || '',
            name: prod?.name || catVar?.products?.name || pv?.sku || 'Footwear',
            brand: prod?.brand || catVar?.products?.brand || '',
            category: prod?.category || catVar?.products?.category || '',
            gender: prod?.gender || '',
            sku: pv?.sku || catVar?.sku || '',
            size: pv?.size || catVar?.size || '',
            colour: pv?.colour || catVar?.colour || '',
            barcode: pv?.barcode || catVar?.barcode || '',
            selling_price: Number(pv?.selling_price ?? catVar?.selling_price ?? 0),
            cost_price: Number(pv?.cost_price ?? catVar?.cost_price ?? 0),
            quantity_received: qty,
            unit_cost: uCost,
            line_cost: qty * uCost,
          };
        });
      } else {
        grnItems = [];
      }
      viewMode = 'receive';
      app.toast(`Loaded Draft GRN ${grnRecord.reference_no || ''}`, 'info');
    } catch (e: any) {
      app.toast('Failed to load draft: ' + (e.message || 'Error'), 'error');
    } finally {
      isProcessing = false;
    }
  }

  // ---------------- GRN History functions (`0ab~__-~_vdob.js` 100% parity) ----------------
  async function fetchGrnHistory() {
    historyLoading = true;
    try {
      const params: string[] = [
        'select=*,suppliers(name),locations(name),profiles(name),supplier_invoices(total_amount,paid_amount,status),grn_items(quantity_received,unit_cost)',
        'order=received_at.desc',
      ];
      if (historyLocationFilter && historyLocationFilter !== 'all') {
        params.push(`location_id=eq.${historyLocationFilter}`);
      }
      if (historyDateFilter !== 'all') {
        const now = new Date();
        const from = new Date();
        if (historyDateFilter === 'today') from.setHours(0, 0, 0, 0);
        else if (historyDateFilter === 'week') from.setDate(now.getDate() - 7);
        else if (historyDateFilter === 'month') from.setMonth(now.getMonth() - 1);
        params.push(`received_at=gte.${from.toISOString()}`);
      }
      const rows = await restGet<any[]>(`grns?${params.join('&')}&limit=200`);
      const q = historySearch.trim().toLowerCase();
      const filtered = (rows || []).filter((g) => {
        if (!q) return true;
        const supName = (g.suppliers?.name || '').toLowerCase();
        const refNo = (g.reference_no || '').toLowerCase();
        const notesStr = (g.notes || '').toLowerCase();
        return supName.includes(q) || refNo.includes(q) || notesStr.includes(q);
      });
      historyTotalCount = filtered.length;
      const start = (historyPage - 1) * PAGE_SIZE;
      historyList = filtered.slice(start, start + PAGE_SIZE);
    } catch (e) {
      console.warn('Error loading GRN history:', e);
    } finally {
      historyLoading = false;
    }
  }

  function calcGrnTotals(g: any): { subtotal: number; disc: number; netTotal: number; pairCount: number } {
    const disc = Number(g.discount || 0);
    const items = Array.isArray(g.grn_items) ? g.grn_items : [];
    const pairCount = items.reduce((s: number, it: any) => s + (Number(it.quantity_received) || 0), 0);
    if (items.length > 0) {
      const sub = items.reduce(
        (s: number, it: any) => s + (Number(it.quantity_received) || 0) * (Number(it.unit_cost) || 0),
        0,
      );
      return { subtotal: sub, disc, netTotal: Math.max(0, sub - disc), pairCount };
    }
    const invTotal = Number(g.supplier_invoices?.[0]?.total_amount || 0);
    const sub = invTotal + disc;
    return { subtotal: sub, disc, netTotal: Math.max(0, sub - disc), pairCount };
  }

  async function toggleExpandHistoryGrn(grnId: string) {
    if (expandedGrnId === grnId) {
      expandedGrnId = null;
      expandedGrnItems = [];
      return;
    }
    expandedGrnId = grnId;
    loadingExpandedItems = true;
    try {
      const data = await restGet<any[]>(
        `grn_items?grn_id=eq.${grnId}&select=id,variant_id,quantity_received,unit_cost,product_variants(sku,size,colour,products(name,brand))`,
      );
      expandedGrnItems = (data || []).map((it) => {
        const pv = Array.isArray(it.product_variants) ? it.product_variants[0] : it.product_variants;
        const prod = pv?.products ? (Array.isArray(pv.products) ? pv.products[0] : pv.products) : null;
        return {
          id: it.id,
          sku: pv?.sku || 'SKU',
          size: pv?.size || '',
          colour: pv?.colour || '',
          name: prod?.name || pv?.sku || 'Item',
          brand: prod?.brand || '',
          quantity_received: Number(it.quantity_received) || 0,
          unit_cost: Number(it.unit_cost) || 0,
        };
      });
    } catch {
      expandedGrnItems = [];
    } finally {
      loadingExpandedItems = false;
    }
  }

  // Confirm Draft GRN directly from History (`Z` in 0ab~__-~_vdob.js)
  async function confirmDraftGrnFromHistory(g: any) {
    if (!g.supplier_id) {
      app.toast('Draft GRN has no supplier selected — opening in editor to select supplier.', 'warning');
      loadDraftGrnForEditing(g);
      return;
    }
    confirmingGrnId = g.id;
    try {
      const items = await restGet<any[]>(`grn_items?grn_id=eq.${g.id}&select=*`);
      if (!items || items.length === 0) throw new Error('No items found in this draft GRN');

      if (g.supplier_id !== OPENING_CAPITAL_SUPPLIER_ID) {
        const sub = items.reduce((s, it) => s + Number(it.unit_cost) * Number(it.quantity_received), 0);
        const net = Math.max(0, sub - Number(g.discount || 0));
        await restWrite('POST', 'supplier_invoices', {
          grn_id: g.id,
          supplier_id: g.supplier_id,
          location_id: g.location_id,
          reference_no: g.reference_no,
          total_amount: net,
          status: 'unpaid',
        });
      }

      for (const it of items) {
        const qty = Number(it.quantity_received) || 0;
        const uCost = Number(it.unit_cost) || 0;
        await restWrite('PATCH', `product_variants?id=eq.${it.variant_id}`, { cost_price: uCost });

        const existing = await restGet<{ id: string; quantity: number }[]>(
          `stock_levels?variant_id=eq.${it.variant_id}&location_id=eq.${g.location_id}&select=id,quantity`,
        );
        let newQty = qty;
        if (existing && existing.length > 0) {
          newQty = Number(existing[0].quantity) + qty;
          await restWrite('PATCH', `stock_levels?id=eq.${existing[0].id}`, { quantity: newQty });
        } else {
          await restWrite('POST', 'stock_levels', {
            variant_id: it.variant_id,
            location_id: g.location_id,
            quantity: newQty,
          });
        }
        app.stockMap.set(`${it.variant_id}_${g.location_id}`, newQty);

        await restWrite('POST', 'stock_movements', {
          variant_id: it.variant_id,
          to_location: g.location_id,
          quantity: qty,
          type: 'purchase_receiving',
          grn_id: g.id,
          created_by: g.received_by || app.currentUser?.id || null,
        });
      }

      await restWrite('PATCH', `grns?id=eq.${g.id}`, { status: 'confirmed' });
      app.syncVersion++;
      SoundFx.success();
      app.toast('GRN confirmed! Stock levels updated.', 'success');
      fetchGrnHistory();
    } catch (e: any) {
      app.toast('Confirmation failed: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      confirmingGrnId = null;
    }
  }

  // Delete Draft GRN (`ee` in 0ab~__-~_vdob.js)
  async function deleteDraftGrn(grnId: string) {
    if (!confirm('Delete this draft GRN? This cannot be undone.')) return;
    deletingGrnId = grnId;
    try {
      await restWrite('DELETE', `grn_items?grn_id=eq.${grnId}`);
      await restWrite('DELETE', `grns?id=eq.${grnId}`);
      app.toast('Draft GRN deleted', 'success');
      fetchGrnHistory();
    } catch (e: any) {
      app.toast('Delete failed: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      deletingGrnId = null;
    }
  }

  // Edit Confirmed GRN Metadata (`y` in 0ab~__-~_vdob.js)
  function openEditConfirmedGrnModal(g: any) {
    editMetaGrn = g;
    editMetaRef = g.reference_no || '';
    editMetaDate = g.received_at ? g.received_at.split('T')[0] : '';
    editMetaDiscount = Number(g.discount || 0);
    editMetaNotes = g.notes || '';
  }

  async function saveConfirmedGrnMetadata() {
    if (!editMetaGrn) return;
    editMetaBusy = true;
    try {
      await restWrite('PATCH', `grns?id=eq.${editMetaGrn.id}`, {
        reference_no: editMetaRef.trim() || null,
        received_at: editMetaDate ? new Date(editMetaDate).toISOString() : editMetaGrn.received_at,
        discount: Number(editMetaDiscount) || 0,
        notes: editMetaNotes.trim() || null,
      });
      app.toast('GRN updated successfully', 'success');
      editMetaGrn = null;
      fetchGrnHistory();
    } catch (e: any) {
      app.toast('Failed to update GRN: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      editMetaBusy = false;
    }
  }

  // ---------------- Quick Add Supplier ----------------
  async function saveNewSupplier() {
    if (!newSupplierName.trim()) {
      app.toast('Please enter supplier name', 'warning');
      return;
    }
    newSupplierBusy = true;
    try {
      const created = await restWrite<Supplier[]>('POST', 'suppliers', {
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || null,
      });
      const s = Array.isArray(created) ? created[0] : (created as any);
      if (s?.id) {
        suppliers = [...suppliers, s].sort((a, b) => a.name.localeCompare(b.name));
        supplierId = s.id;
        newSupplierOpen = false;
        newSupplierName = '';
        newSupplierPhone = '';
        app.toast(`Supplier "${s.name}" added!`, 'success');
      }
    } catch (e: any) {
      app.toast('Failed to add supplier: ' + (e.message || 'Error'), 'error');
    } finally {
      newSupplierBusy = false;
    }
  }

  // ---------------- Add New Product & Variants Modal (`rL` in 048._yz._dgjl.js) ----------------
  function openNewProductModal(prefillName = '', prefillSize = '', prefillBarcode = '') {
    npName = prefillName;
    npBrand = allBrands[0] || '';
    npCategory = allCategories[0] || 'Casual';
    npGender = 'unisex';
    npDescription = '';
    npAddToGrn = true;
    const baseSku = prefillName ? prefillName.trim().toUpperCase().replace(/\s+/g, '-') : '';
    npVariants = [
      {
        sku: baseSku && prefillSize ? `${baseSku}-${prefillSize}` : baseSku,
        size: prefillSize,
        colour: '',
        cost_price: '',
        selling_price: '',
        barcode: prefillBarcode,
        qty: '1',
      },
    ];
    newProductOpen = true;
  }

  function addNpVariantRow() {
    const last = npVariants[npVariants.length - 1];
    npVariants.push({
      sku: '',
      size: '',
      colour: last?.colour || '',
      cost_price: last?.cost_price || '',
      selling_price: last?.selling_price || '',
      barcode: '',
      qty: '1',
    });
  }

  function removeNpVariantRow(idx: number) {
    if (npVariants.length <= 1) return;
    npVariants.splice(idx, 1);
  }

  function generateVariantBarcodeFromSku(idx: number) {
    const row = npVariants[idx];
    if (!row) return;
    if (!row.sku.trim()) {
      const base = npName.trim().toUpperCase().replace(/\s+/g, '-') || 'SHOE';
      row.sku = row.size.trim() ? `${base}-${row.size.trim()}` : `${base}-${idx + 1}`;
    }
    row.barcode = row.sku.trim().toUpperCase();
    app.toast(`Barcode set to: ${row.barcode}`, 'info');
  }

  async function createInlineBrand() {
    const b = inlineBrandName.trim();
    if (!b) return;
    try {
      await restWrite('POST', 'brands', { name: b });
      dbBrands = [...dbBrands, b].sort((x, y) => x.localeCompare(y));
    } catch {}
    npBrand = b;
    inlineBrandName = '';
    addingBrandInline = false;
  }

  async function createInlineCategory() {
    const c = inlineCategoryName.trim();
    if (!c) return;
    try {
      await restWrite('POST', 'categories', { name: c });
      dbCategories = [...dbCategories, c].sort((x, y) => x.localeCompare(y));
    } catch {}
    npCategory = c;
    inlineCategoryName = '';
    addingCategoryInline = false;
  }

  async function submitNewProductCatalog() {
    if (!npName.trim()) {
      app.toast('Product Name is required', 'warning');
      return;
    }
    for (let i = 0; i < npVariants.length; i++) {
      const v = npVariants[i];
      if (!v.sku.trim()) {
        const base = npName.trim().toUpperCase().replace(/\s+/g, '-');
        v.sku = v.size.trim() ? `${base}-${v.size.trim()}` : `${base}-${i + 1}`;
      }
      if (!v.selling_price || Number(v.selling_price) <= 0) {
        app.toast(`Please enter Selling Price for variant #${i + 1}`, 'warning');
        return;
      }
    }

    npBusy = true;
    try {
      // 1. Insert product
      const prodRes = await restWrite<any[]>('POST', 'products', {
        name: npName.trim(),
        brand: npBrand.trim() || null,
        category: npCategory.trim() || 'Casual',
        gender: npGender || null,
        description: npDescription.trim() || null,
        status: 'active',
      });
      const createdProd = Array.isArray(prodRes) ? prodRes[0] : prodRes;

      // 2. Insert variants
      const payload = npVariants.map((v) => ({
        product_id: createdProd.id,
        sku: v.sku.trim().toUpperCase(),
        size: v.size.trim() || null,
        colour: v.colour.trim() || null,
        cost_price: parseFloat(v.cost_price) || 0,
        selling_price: parseFloat(v.selling_price) || 0,
        barcode: v.barcode.trim() || null,
      }));
      const createdVars = await restWrite<any[]>('POST', 'product_variants', payload);
      const varArray = Array.isArray(createdVars) ? createdVars : [createdVars];

      const fullVariants: Variant[] = varArray.map((cv) => ({
        ...cv,
        products: {
          id: createdProd.id,
          name: createdProd.name,
          brand: createdProd.brand,
          category: createdProd.category,
          gender: createdProd.gender,
        },
      }));

      // Add to local catalog
      app.catalog.unshift(...fullVariants);
      app.productsMap.set(createdProd.id, fullVariants);
      app.syncVersion++;

      // Optionally add directly to current GRN shipment
      if (npAddToGrn) {
        fullVariants.forEach((fv, idx) => {
          const qty = Math.max(1, parseInt(npVariants[idx]?.qty || '1') || 1);
          addVariantToGrn(fv, qty, true);
        });
        SoundFx.success();
        app.toast(`Product "${createdProd.name}" (${fullVariants.length} variants) registered & added to GRN!`, 'success');
      } else {
        app.toast(`Product "${createdProd.name}" registered in catalog!`, 'success');
      }

      newProductOpen = false;
    } catch (e: any) {
      app.toast('Failed to register product: ' + (e.message || 'Error'), 'error');
    } finally {
      npBusy = false;
    }
  }
</script>

<svelte:window onclick={() => { showSearchDropdown = false; mismatchPopoverKey = null; }} />

<div class="space-y-4">
  <!-- TOP HEADER & SUB-VIEW SWITCHER -->
  <div class="card p-4 sm:p-5">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex items-start gap-3">
        <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fg text-bg shadow-xs">
          <PackagePlus class="h-5 w-5" />
        </div>
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="font-display text-base font-bold tracking-tight text-fg sm:text-lg">
              {draftGrnId ? 'Edit Draft GRN (තොග කෙටුම්පත)' : 'Goods Received Note — GRN (නව තොග ඇතුළත් කිරීම)'}
            </h1>
            {#if draftGrnId}
              <span class="chip border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-[10px]">
                Editing Draft
              </span>
            {/if}
          </div>
          <p class="mt-0.5 text-xs text-muted">
            Receive supplier shipments into branch stock · Updates cost &amp; selling prices · Creates supplier invoices &amp; draft GRNs
          </p>
        </div>
      </div>

      <!-- Mode Switcher & New Product Button -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="grid flex-1 sm:flex-initial grid-cols-2 rounded-lg border border-line bg-surface p-0.5">
          <button
            type="button"
            class="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition
              {viewMode === 'receive' ? 'bg-fg text-bg shadow-xs' : 'text-muted hover:text-fg'}"
            onclick={() => (viewMode = 'receive')}
          >
            <PackagePlus class="h-3.5 w-3.5" />
            <span>{draftGrnId ? 'Edit Draft' : 'New GRN'}</span>
          </button>
          <button
            type="button"
            class="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition
              {viewMode === 'history' ? 'bg-fg text-bg shadow-xs' : 'text-muted hover:text-fg'}"
            onclick={() => {
              viewMode = 'history';
              fetchGrnHistory();
            }}
          >
            <History class="h-3.5 w-3.5" />
            <span>GRN History ({historyTotalCount})</span>
          </button>
        </div>

        <button
          type="button"
          class="btn btn-sm h-9 px-3 text-xs font-semibold w-full sm:w-auto justify-center"
          onclick={() => openNewProductModal()}
          title="Register a brand new shoe model & variants in catalog"
        >
          <Plus class="h-3.5 w-3.5 text-ok" />
          <span>+ New Product</span>
        </button>
      </div>
    </div>
  </div>

  {#if viewMode === 'receive'}
    <!-- ==================== GRN RECEIVE / EDIT DRAFT VIEW (100% Desktop POS Parity) ==================== -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
      <!-- LEFT COLUMN: Shipment Details (4 cols on desktop) -->
      <div class="min-w-0 space-y-4 lg:col-span-4">
        <div class="card p-4 sm:p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 class="font-display text-sm font-bold text-fg">Shipment Details</h2>
              <p class="text-[11px] text-muted">Select vendor and arrival info.</p>
            </div>
            {#if draftGrnId}
              <button
                type="button"
                class="btn btn-ghost btn-sm h-7 px-2 text-[11px] text-bad"
                onclick={resetGrnForm}
              >
                <X class="h-3 w-3" />
                <span>Cancel Draft</span>
              </button>
            {/if}
          </div>

          <div class="space-y-3.5 text-xs">
            <!-- Supplier / Vendor -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label for="grn-supplier" class="label mb-0 flex items-center gap-1.5">
                  <Truck class="h-3.5 w-3.5 text-dim" />
                  <span>Supplier / Vendor *</span>
                </label>
                <button
                  type="button"
                  class="text-[11px] font-semibold text-ok hover:underline cursor-pointer"
                  onclick={() => (newSupplierOpen = true)}
                >
                  + New Supplier
                </button>
              </div>
              <select id="grn-supplier" class="input h-10 text-xs font-medium" bind:value={supplierId}>
                <option value="">Select Vendor</option>
                {#each suppliers as sup (sup.id)}
                  <option value={sup.id}>{sup.name}</option>
                {/each}
              </select>
            </div>

            <!-- Opening Capital Special Alert & Batch Selector (Exact Desktop POS Parity) -->
            {#if supplierId === OPENING_CAPITAL_SUPPLIER_ID}
              <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300 space-y-2">
                <div class="flex items-start gap-2">
                  <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div class="space-y-0.5">
                    <div class="text-xs font-bold">Opening Capital — No Invoice Created</div>
                    <p class="text-[11px] opacity-90 leading-relaxed">
                      This represents the owner's initial stock investment. A supplier invoice will NOT be generated, as this is not an external payable.
                    </p>
                  </div>
                </div>

                {#if batchRefs.length > 0}
                  <div class="space-y-1.5 pt-2 border-t border-amber-500/20">
                    <label for="grn-batch-select" class="text-[10px] font-bold uppercase tracking-wider">
                      Import Batch
                    </label>
                    <div class="flex gap-2">
                      <select
                        id="grn-batch-select"
                        class="input h-9 flex-1 text-xs"
                        bind:value={selectedBatchRef}
                      >
                        <option value="">Select a batch...</option>
                        {#each batchRefs as bRef (bRef)}
                          <option value={bRef}>{bRef}</option>
                        {/each}
                      </select>
                      <button
                        type="button"
                        class="btn btn-sm h-9 px-3 shrink-0"
                        onclick={addBatchProductsToGrn}
                        disabled={loadingBatch || !selectedBatchRef}
                      >
                        {#if loadingBatch}
                          <Loader2 class="h-3.5 w-3.5 animate-spin" />
                          <span>Adding...</span>
                        {:else}
                          <Package class="h-3.5 w-3.5" />
                          <span>Add Batch</span>
                        {/if}
                      </button>
                    </div>
                  </div>
                {/if}
              </div>
            {/if}

            <!-- Receiving Branch -->
            <div class="space-y-1.5">
              <label for="grn-branch" class="label mb-0 flex items-center gap-1.5">
                <Store class="h-3.5 w-3.5 text-dim" />
                <span>Receiving Branch *</span>
              </label>
              <select id="grn-branch" class="input h-10 text-xs font-medium" bind:value={locationId}>
                <option value="">Select Location</option>
                {#each app.locations as loc (loc.id)}
                  <option value={loc.id}>{loc.name}</option>
                {/each}
              </select>
            </div>

            <!-- Reference # & GRN Date (2 cols on mobile & desktop) -->
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div class="space-y-1.5">
                <label for="grn-ref" class="label mb-0 flex items-center gap-1.5">
                  <FileText class="h-3.5 w-3.5 text-dim" />
                  <span>Reference # (Invoice/DO)</span>
                </label>
                <input
                  id="grn-ref"
                  type="text"
                  class="input h-10 text-xs font-mono"
                  placeholder="e.g. INV-2026-001"
                  bind:value={referenceNo}
                />
              </div>

              <div class="space-y-1.5">
                <label for="grn-date" class="label mb-0 flex items-center gap-1.5">
                  <Calendar class="h-3.5 w-3.5 text-dim" />
                  <span>GRN Date</span>
                </label>
                <input
                  id="grn-date"
                  type="date"
                  class="input h-10 text-xs font-mono"
                  bind:value={grnDate}
                />
              </div>
            </div>

            <!-- Arrival Notes & Discount -->
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div class="space-y-1.5">
                <label for="grn-notes" class="label mb-0">Arrival Notes</label>
                <input
                  id="grn-notes"
                  type="text"
                  class="input h-10 text-xs"
                  placeholder="e.g. Partial delivery, box note"
                  bind:value={notes}
                />
              </div>

              <div class="space-y-1.5">
                <label for="grn-discount" class="label mb-0">Discount (Rs.)</label>
                <input
                  id="grn-discount"
                  type="number"
                  class="input h-10 font-mono text-xs font-semibold"
                  placeholder="0"
                  min="0"
                  bind:value={discount}
                />
              </div>
            </div>
          </div>

          <!-- Desktop Action Buttons -->
          <div class="hidden lg:block space-y-2.5 pt-2 border-t border-line">
            <button
              type="button"
              class="btn btn-primary w-full h-12 text-sm font-bold shadow-md"
              onclick={confirmAndAddGrnToStock}
              disabled={isProcessing || grnItems.length === 0}
            >
              {#if isProcessing}
                <Loader2 class="h-4 w-4 animate-spin" />
                <span>PROCESSING...</span>
              {:else}
                <Check class="h-4 w-4" />
                <span>CONFIRM &amp; ADD TO STOCK</span>
              {/if}
            </button>

            <button
              type="button"
              class="btn w-full h-10 text-xs font-semibold"
              onclick={saveGrnAsDraft}
              disabled={isProcessing || grnItems.length === 0}
            >
              <span>{draftGrnId ? 'Update Draft' : 'Save as Draft'}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: Items in Shipment (8 cols on desktop) -->
      <div class="min-w-0 space-y-4 lg:col-span-8">
        <div class="card overflow-visible">
          <!-- Header & Search Bar -->
          <div
            class="flex flex-col gap-3 border-b border-line p-4 sm:p-5"
            onclick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 class="font-display text-sm font-bold text-fg">Items in Shipment</h2>
                <p class="text-[11px] text-muted">
                  {#if grnItems.length > 0}
                    <strong class="text-fg">{groupedShipment.length}</strong> product(s) ·
                    <strong class="text-fg">{grnItems.length}</strong> variant(s) ·
                    <strong class="text-ok font-mono">{totalPairsInGrn} pairs</strong>
                  {:else}
                    Add all products received in this delivery.
                  {/if}
                </p>
              </div>

              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  class="btn btn-sm h-8 px-2.5 text-xs"
                  onclick={() => openNewProductModal(searchQuery)}
                >
                  <Plus class="h-3.5 w-3.5 text-ok" />
                  <span>+ New Shoe</span>
                </button>
                <button
                  type="button"
                  class="btn btn-primary btn-sm h-8 px-3 text-xs"
                  onclick={() => (cameraOpen = true)}
                >
                  <Camera class="h-3.5 w-3.5" />
                  <span>Camera Scan</span>
                </button>
              </div>
            </div>

            <!-- Search Input -->
            <div class="relative">
              <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
              <input
                type="text"
                class="input h-11 pl-10 pr-20 text-xs sm:text-sm font-medium"
                placeholder="Search by product name or SKU, or scan barcode..."
                bind:value={searchQuery}
                oninput={onSearchInput}
                onfocus={() => { if (searchQuery.trim().length >= 2) showSearchDropdown = true; }}
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    clearTimeout(searchDebounceTimer);
                    handleBarcodeScan(searchQuery);
                  }
                }}
              />
              <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {#if searchQuery}
                  <button
                    type="button"
                    class="grid size-7 cursor-pointer place-items-center rounded-md text-dim hover:bg-surface hover:text-fg"
                    onclick={resetSearch}
                    aria-label="Clear search"
                  >
                    <X class="size-3.5" />
                  </button>
                {/if}
                <button
                  type="button"
                  class="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-fg"
                  onclick={() => (cameraOpen = true)}
                >
                  <Camera class="size-3.5 text-ok" />
                  <span>Scan</span>
                </button>
              </div>

              <!-- Grouped Search Dropdown (Exact Desktop POS `ee` Parity) -->
              {#if showSearchDropdown && debouncedQuery.trim().length >= 2}
                <div class="absolute left-0 right-0 z-40 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl divide-y divide-line">
                  {#each groupedSearchResults as grp (grp.name)}
                    <div>
                      {#if grp.variants.length > 1}
                        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-raised/95 px-3.5 py-2 backdrop-blur-xs">
                          <span class="text-[11px] font-bold uppercase tracking-wider text-fg">
                            {grp.name} ({grp.variants.length} variants)
                          </span>
                          <button
                            type="button"
                            class="btn btn-sm h-6 px-2 text-[10px] font-bold text-ok border-ok/30 bg-ok/10 hover:bg-ok/20"
                            onclick={(e) => {
                              e.stopPropagation();
                              addAllVariantsToGrn(grp.variants);
                            }}
                          >
                            <span>Add All +</span>
                          </button>
                        </div>
                      {/if}
                      {#each grp.variants as v (v.id)}
                        {@const curSt = app.getStock(v.id, locationId)}
                        <button
                          type="button"
                          class="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-line/50 px-3.5 py-2.5 text-left transition last:border-0 hover:bg-raised"
                          onclick={() => {
                            addVariantToGrn(v, 1);
                            resetSearch();
                          }}
                        >
                          <div class="min-w-0">
                            {#if grp.variants.length === 1}
                              <div class="font-bold text-xs text-fg">{v.products?.name || v.sku}</div>
                            {/if}
                            <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                              <span class="font-mono text-fg">SKU: {v.sku}</span>
                              <span>|</span>
                              <span class="chip py-0 text-[10px] font-bold text-fg">
                                Size: {getShoeDisplaySize(v.size, v.products)}
                              </span>
                              {#if v.products?.brand}
                                <span>| {v.products.brand}</span>
                              {/if}
                              <span class="text-[10px] font-mono text-dim">(Stock: {curSt})</span>
                            </div>
                          </div>
                          <div class="shrink-0 text-right">
                            <div class="font-mono text-xs text-muted">
                              Cost: Rs.{Number(v.cost_price || 0).toLocaleString()}
                            </div>
                            <div class="mt-0.5 text-[10px] font-bold uppercase text-ok">
                              Select to Add +
                            </div>
                          </div>
                        </button>
                      {/each}
                    </div>
                  {:else}
                    <div class="p-5 text-center space-y-2.5">
                      <p class="text-xs text-muted">No product found for "{debouncedQuery}"</p>
                      <button
                        type="button"
                        class="btn btn-primary btn-sm h-8 px-3 text-xs"
                        onclick={() => {
                          const { baseSku, size } = extractBaseSkuAndSize(debouncedQuery.trim());
                          openNewProductModal(baseSku || debouncedQuery.trim(), size || '');
                          resetSearch();
                        }}
                      >
                        <Plus class="h-3.5 w-3.5" />
                        <span>Register "{debouncedQuery.trim()}" as New Product</span>
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-dim">
              <Zap class="h-3 w-3 text-ok" />
              <span>Scan barcode anywhere or use Camera Scan to add automatically</span>
            </div>
          </div>

          <!-- Desktop Table Column Headers (`hidden md:flex` in 0ql7oe6iu_bx3.js) -->
          {#if groupedShipment.length > 0}
            <div class="hidden md:flex items-center gap-3 border-b border-line bg-raised/50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-dim">
              <div class="w-[22%] min-w-[140px]">Product</div>
              <div class="flex-1">Sizes / Variants (Qty)</div>
              <div class="w-[110px] text-center">Unit Cost</div>
              <div class="w-[110px] text-center">Sell Price</div>
              <div class="w-[100px] text-right">Total</div>
              <div class="w-14 text-right">Actions</div>
            </div>
          {/if}

          <!-- Shipment Items Body -->
          {#if groupedShipment.length === 0}
            <div class="p-12 text-center">
              <Package class="mx-auto mb-3 h-10 w-10 text-dim opacity-40" />
              <p class="text-xs font-semibold text-fg">No items added to the shipment yet.</p>
              <p class="mt-1 text-[11px] text-dim">
                Search above or scan a shoe barcode to start your GRN batch entry.
              </p>
            </div>
          {:else}
            <div class="divide-y divide-line">
              {#each groupedShipment as group (group.key)}
                {@const perSizeMode = Boolean(perSizeCostKeys[group.key])}
                {@const unaddedSibs = getUnaddedSiblingsForGroup(group)}
                <div class="p-3.5 sm:px-4 sm:py-3.5 hover:bg-raised/20 transition">
                  <div class="flex flex-col gap-3 md:flex-row md:items-center">
                    <!-- 1. Product Info + Mobile Group Actions -->
                    <div class="flex items-start justify-between gap-2 md:w-[22%] md:min-w-[140px]">
                      <div class="min-w-0">
                        <div class="font-display text-xs sm:text-sm font-bold text-fg truncate">
                          {group.name}
                        </div>
                        <div class="mt-0.5 text-[10px] font-semibold uppercase tracking-tight text-muted">
                          {group.brand ? `${group.brand} · ` : ''}{group.items.length} size{group.items.length > 1 ? 's' : ''} ·
                          <span class="font-mono text-ok font-bold">{group.totalQty} pcs</span>
                        </div>
                      </div>

                      <!-- Mobile-only Group Action Buttons -->
                      <div class="flex items-center gap-1 md:hidden">
                        <button
                          type="button"
                          class="btn btn-sm h-7 px-2 text-[10px] {perSizeMode ? 'border-ok/40 bg-ok/10 text-ok' : 'text-muted'}"
                          onclick={() => togglePerSizeCost(group.key)}
                          title={perSizeMode ? 'Use one shared cost' : 'Set cost per size'}
                        >
                          <RefreshCw class="h-3 w-3" />
                          <span>{perSizeMode ? 'Shared Cost' : 'Cost/Size'}</span>
                        </button>
                        <button
                          type="button"
                          class="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-dim hover:bg-bad/10 hover:text-bad"
                          onclick={() => removeGroupFromGrn(group.key)}
                          title="Remove product group"
                        >
                          <Trash2 class="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <!-- 2. Sizes / Variants (Qty) Chips -->
                    <div class="flex-1 space-y-2">
                      <div class="flex flex-wrap gap-2">
                        {#each group.items as item (item.id)}
                          <div class="flex items-center gap-1.5 rounded-lg border border-line bg-raised/50 pl-2.5 pr-1.5 py-1">
                            <span class="font-mono text-[11px] font-bold uppercase text-fg">
                              {item.size ? `Sz ${item.size}` : item.sku}
                            </span>
                            <input
                              type="number"
                              min="1"
                              class="input h-7 w-14 px-1 text-center font-mono text-xs font-bold"
                              value={item.quantity_received}
                              oninput={(e) => updateItemField(item.id, 'quantity_received', (e.currentTarget as HTMLInputElement).value)}
                              title="Quantity received"
                            />
                            {#if perSizeMode}
                              <input
                                type="number"
                                min="0"
                                class="input h-7 w-20 px-1 text-center font-mono text-[11px] border-ok/40"
                                value={item.unit_cost}
                                oninput={(e) => updateItemField(item.id, 'unit_cost', (e.currentTarget as HTMLInputElement).value)}
                                title="Unit cost for this size"
                              />
                            {/if}
                            <button
                              type="button"
                              class="grid size-6 cursor-pointer place-items-center rounded text-dim hover:bg-bad/10 hover:text-bad"
                              onclick={() => removeVariantFromGrn(item.id)}
                              title="Remove size"
                            >
                              <Trash2 class="h-3 w-3" />
                            </button>
                          </div>
                        {/each}
                      </div>

                      <!-- Unadded sibling sizes for quick 1-tap add -->
                      {#if unaddedSibs.length > 0}
                        <div class="flex flex-wrap items-center gap-1">
                          <span class="text-[9px] font-semibold uppercase tracking-wider text-dim mr-0.5">Add Size:</span>
                          {#each unaddedSibs as sib (sib.id)}
                            <button
                              type="button"
                              class="cursor-pointer rounded border border-dashed border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted hover:border-fg/40 hover:text-fg"
                              onclick={() => addVariantToGrn(sib, 1)}
                            >
                              + Sz {getShoeDisplaySize(sib.size, sib.products)}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    </div>

                    <!-- 3. Unit Cost & Sell Price (2-col grid on mobile, inline on desktop) -->
                    <div class="grid grid-cols-2 gap-2.5 md:flex md:items-center md:gap-3">
                      <!-- Shared Unit Cost -->
                      <div class="md:w-[110px] relative" onclick={(e) => e.stopPropagation()} role="presentation">
                        <span class="block md:hidden text-[9px] font-bold uppercase tracking-wider text-dim mb-1">
                          Unit Cost (Rs.)
                        </span>
                        <div class="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            class="input h-9 w-full px-2 text-center font-mono text-xs"
                            value={group.unitCost}
                            oninput={(e) => updateGroupField(group.key, 'unit_cost', (e.currentTarget as HTMLInputElement).value)}
                          />
                          {#if group.costMismatch && !perSizeMode}
                            <button
                              type="button"
                              class="text-amber-500 shrink-0 p-1 cursor-pointer"
                              onclick={() => (mismatchPopoverKey = mismatchPopoverKey === group.key ? null : group.key)}
                              title="Sizes have different costs — click to review"
                            >
                              <AlertCircle class="h-4 w-4" />
                            </button>
                          {/if}
                        </div>

                        <!-- Cost Mismatch Popover (`ev` in 0ql7oe6iu_bx3.js) -->
                        {#if mismatchPopoverKey === group.key}
                          <div class="absolute right-0 md:left-0 top-full z-40 mt-1 w-64 rounded-xl border border-line bg-surface p-3 shadow-2xl space-y-2.5 text-xs">
                            <div class="text-[10px] font-bold uppercase tracking-wider text-muted">
                              Costs differ across sizes
                            </div>
                            <div class="max-h-40 space-y-1.5 overflow-y-auto">
                              {#each group.items as it (it.id)}
                                <div class="flex items-center justify-between text-xs">
                                  <span class="font-bold">Sz {it.size || it.sku}</span>
                                  <div class="flex items-center gap-2">
                                    <span class="font-mono text-muted">Rs. {Number(it.unit_cost).toLocaleString()}</span>
                                    <button
                                      type="button"
                                      class="text-[10px] font-bold uppercase text-ok hover:underline cursor-pointer"
                                      onclick={() => {
                                        updateGroupField(group.key, 'unit_cost', it.unit_cost);
                                        mismatchPopoverKey = null;
                                      }}
                                    >
                                      Use this
                                    </button>
                                  </div>
                                </div>
                              {/each}
                            </div>
                            <div class="flex items-center gap-1.5 border-t border-line pt-2">
                              <input
                                type="number"
                                placeholder="Custom cost"
                                class="input h-7 flex-1 text-xs font-mono"
                                bind:value={customSyncCost}
                              />
                              <button
                                type="button"
                                class="btn btn-sm h-7 px-2 text-[10px]"
                                disabled={!customSyncCost}
                                onclick={() => {
                                  updateGroupField(group.key, 'unit_cost', customSyncCost);
                                  customSyncCost = '';
                                  mismatchPopoverKey = null;
                                }}
                              >
                                Sync All
                              </button>
                            </div>
                          </div>
                        {/if}
                      </div>

                      <!-- Shared Sell Price -->
                      <div class="md:w-[110px]">
                        <span class="block md:hidden text-[9px] font-bold uppercase tracking-wider text-dim mb-1">
                          Sell Price (Rs.)
                        </span>
                        <input
                          type="number"
                          min="0"
                          class="input h-9 w-full px-2 text-center font-mono text-xs font-bold text-ok"
                          value={group.sellPrice}
                          oninput={(e) => updateGroupField(group.key, 'selling_price', (e.currentTarget as HTMLInputElement).value)}
                        />
                      </div>
                    </div>

                    <!-- 4. Group Total & Desktop Actions -->
                    <div class="flex items-center justify-between border-t border-line/50 pt-2 md:border-0 md:pt-0 md:w-[100px] md:justify-end">
                      <span class="text-[10px] font-bold uppercase tracking-wider text-dim md:hidden">
                        Group Total
                      </span>
                      <span class="font-mono text-xs sm:text-sm font-bold text-fg">
                        Rs. {group.totalCost.toLocaleString()}
                      </span>
                    </div>

                    <div class="hidden md:flex items-center justify-end gap-1 w-14">
                      <button
                        type="button"
                        class="grid h-7 w-7 cursor-pointer place-items-center rounded transition
                          {perSizeMode ? 'bg-ok/15 text-ok' : 'text-dim hover:bg-raised hover:text-fg'}"
                        onclick={() => togglePerSizeCost(group.key)}
                        title={perSizeMode ? 'Use one shared cost' : 'Set cost per size'}
                      >
                        <RefreshCw class="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        class="grid h-7 w-7 cursor-pointer place-items-center rounded text-dim hover:bg-bad/10 hover:text-bad"
                        onclick={() => removeGroupFromGrn(group.key)}
                        title="Remove product group"
                      >
                        <Trash2 class="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Shipment Totals Footer -->
          {#if grnItems.length > 0}
            <div class="border-t border-line bg-raised/30 p-4 sm:px-6">
              <div class="flex flex-wrap items-center justify-between gap-4 sm:justify-end sm:gap-8">
                <div class="text-left sm:text-right">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-dim">Total Pairs</div>
                  <div class="font-mono text-base sm:text-lg font-bold text-fg">{totalPairsInGrn} Pairs</div>
                </div>

                <div class="text-right">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-dim">Subtotal</div>
                  <div class="font-mono text-base sm:text-lg font-bold text-fg">Rs. {subtotalCost.toLocaleString()}</div>
                </div>

                {#if Number(discount) > 0}
                  <div class="text-right">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-dim">Discount</div>
                    <div class="font-mono text-base sm:text-lg font-bold text-bad">− Rs. {Number(discount).toLocaleString()}</div>
                  </div>

                  <div class="text-right">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-dim">Net Total</div>
                    <div class="font-mono text-base sm:text-lg font-bold text-ok">Rs. {netTotalCost.toLocaleString()}</div>
                  </div>
                {/if}
              </div>

              <!-- Mobile Action Buttons (shown right below totals on phone/tablet) -->
              <div class="mt-4 flex flex-col gap-2.5 sm:flex-row lg:hidden">
                <button
                  type="button"
                  class="btn btn-primary h-12 flex-[2] text-sm font-bold shadow-md"
                  onclick={confirmAndAddGrnToStock}
                  disabled={isProcessing || grnItems.length === 0}
                >
                  {#if isProcessing}
                    <Loader2 class="h-4 w-4 animate-spin" />
                    <span>PROCESSING...</span>
                  {:else}
                    <Check class="h-4 w-4" />
                    <span>CONFIRM &amp; ADD TO STOCK</span>
                  {/if}
                </button>
                <button
                  type="button"
                  class="btn h-11 flex-1 text-xs font-semibold"
                  onclick={saveGrnAsDraft}
                  disabled={isProcessing || grnItems.length === 0}
                >
                  <span>{draftGrnId ? 'Update Draft' : 'Save as Draft'}</span>
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <!-- ==================== GRN HISTORY & DRAFTS VIEW (100% Desktop POS Parity + Mobile Cards) ==================== -->
    <div class="card overflow-hidden">
      <!-- Filters Header -->
      <div class="flex flex-col gap-3 border-b border-line bg-raised/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="font-display text-sm font-bold text-fg">All Goods Received Notes (GRN History)</h2>
          <p class="text-[11px] text-muted">Tap any GRN to inspect items, confirm drafts, or edit details.</p>
        </div>

        <div class="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <!-- Search Supplier / Ref -->
          <div class="relative sm:w-52">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
            <input
              type="text"
              class="input h-9 pl-8 pr-7 text-xs"
              placeholder="Search supplier or ref #..."
              bind:value={historySearch}
              oninput={() => {
                historyPage = 1;
                fetchGrnHistory();
              }}
            />
            {#if historySearch}
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-dim hover:text-fg"
                onclick={() => {
                  historySearch = '';
                  historyPage = 1;
                  fetchGrnHistory();
                }}
              >
                <X class="h-3.5 w-3.5" />
              </button>
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-2 sm:flex">
            <!-- Branch Filter -->
            <select
              class="input h-9 text-xs sm:w-44"
              bind:value={historyLocationFilter}
              onchange={() => {
                historyPage = 1;
                fetchGrnHistory();
              }}
            >
              <option value="all">All Locations</option>
              {#each app.locations as loc (loc.id)}
                <option value={loc.id}>{loc.name}</option>
              {/each}
            </select>

            <!-- Date Range Filter -->
            <select
              class="input h-9 text-xs sm:w-36"
              bind:value={historyDateFilter}
              onchange={() => {
                historyPage = 1;
                fetchGrnHistory();
              }}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Past 7 Days</option>
              <option value="month">Past 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {#if historyLoading}
        <div class="p-12 text-center text-xs text-muted">
          <Loader2 class="mx-auto mb-2 h-6 w-6 animate-spin text-dim" />
          Loading GRN history...
        </div>
      {:else if historyList.length === 0}
        <div class="p-12 text-center">
          <Package class="mx-auto mb-2 h-10 w-10 text-dim opacity-30" />
          <p class="text-xs font-semibold text-fg">No GRNs found.</p>
          <p class="mt-0.5 text-[11px] text-dim">Create a new GRN or adjust your filters above.</p>
        </div>
      {:else}
        <!-- MOBILE STACKED CARDS VIEW (`md:hidden`) -->
        <div class="divide-y divide-line md:hidden">
          {#each historyList as g (g.id)}
            {@const tot = calcGrnTotals(g)}
            {@const invStatus = g.supplier_invoices?.[0]?.status}
            {@const isDraft = g.status === 'draft'}
            {@const isExpanded = expandedGrnId === g.id}
            <div class="p-3.5 space-y-2.5">
              <div
                class="flex items-start justify-between gap-2 cursor-pointer"
                onclick={() => toggleExpandHistoryGrn(g.id)}
                role="presentation"
              >
                <div class="min-w-0 space-y-1">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="font-mono text-xs font-bold text-fg">
                      {g.reference_no || `GRN-${g.id.slice(0, 6).toUpperCase()}`}
                    </span>
                    {#if isDraft}
                      <span class="chip border-amber-500/40 bg-amber-500/15 py-0 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
                        Draft
                      </span>
                    {:else}
                      <span class="chip py-0 text-[10px] font-bold uppercase {invStatus === 'paid' ? 'border-ok/30 bg-ok/10 text-ok' : 'text-muted'}">
                        {invStatus ? invStatus.replace('_', ' ') : 'Confirmed'}
                      </span>
                    {/if}
                    {#if tot.pairCount > 0}
                      <span class="chip py-0 font-mono text-[10px] text-fg">{tot.pairCount} prs</span>
                    {/if}
                  </div>
                  <div class="text-xs font-semibold text-fg">
                    {g.suppliers?.name || 'No Supplier'} · <span class="text-muted">{g.locations?.name || '—'}</span>
                  </div>
                  <div class="text-[11px] text-dim">
                    {new Date(g.received_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {new Date(g.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {#if g.profiles?.name} · By {g.profiles.name}{/if}
                  </div>
                </div>

                <div class="shrink-0 text-right">
                  <div class="font-mono text-sm font-bold text-fg">Rs. {tot.netTotal.toLocaleString()}</div>
                  {#if tot.disc > 0}
                    <div class="font-mono text-[10px] text-bad">Disc: -Rs.{tot.disc.toLocaleString()}</div>
                  {/if}
                  <div class="mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-dim">
                    <span>{isExpanded ? 'Hide Items' : 'View Items'}</span>
                    {#if isExpanded}<ChevronUp class="h-3 w-3" />{:else}<ChevronDown class="h-3 w-3" />{/if}
                  </div>
                </div>
              </div>

              <!-- Expanded Items on Mobile -->
              {#if isExpanded}
                <div class="rounded-xl border border-line bg-raised/40 p-2.5 space-y-1.5 text-xs">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-dim">Items Received</div>
                  {#if loadingExpandedItems}
                    <div class="py-3 text-center text-muted italic">Loading items...</div>
                  {:else if expandedGrnItems.length === 0}
                    <div class="py-2 text-muted italic">No items found.</div>
                  {:else}
                    <div class="divide-y divide-line/60">
                      {#each expandedGrnItems as it (it.id)}
                        <div class="flex items-center justify-between gap-2 py-1.5">
                          <div class="min-w-0">
                            <div class="font-semibold text-fg truncate">
                              {it.brand ? `${it.brand} · ` : ''}{it.name}
                            </div>
                            <div class="font-mono text-[10px] text-muted">
                              SKU: {it.sku}{it.size ? ` · Sz ${it.size}` : ''}{it.colour ? ` · ${it.colour}` : ''}
                            </div>
                          </div>
                          <div class="shrink-0 text-right font-mono text-xs">
                            <span class="font-bold text-fg">×{it.quantity_received}</span>
                            <span class="text-muted"> @ Rs.{it.unit_cost.toLocaleString()}</span>
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Mobile Action Buttons -->
              <div class="flex flex-wrap items-center gap-1.5 pt-1">
                {#if isDraft}
                  <button
                    type="button"
                    class="btn btn-sm h-8 flex-1 text-xs font-semibold"
                    onclick={() => loadDraftGrnForEditing(g)}
                  >
                    <Pencil class="h-3.5 w-3.5" />
                    <span>Edit Draft</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm h-8 flex-1 text-xs font-bold"
                    onclick={() => confirmDraftGrnFromHistory(g)}
                    disabled={confirmingGrnId === g.id}
                  >
                    {#if confirmingGrnId === g.id}
                      <Loader2 class="h-3.5 w-3.5 animate-spin" />
                    {:else}
                      <CircleCheckBig class="h-3.5 w-3.5" />
                    {/if}
                    <span>Confirm GRN</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm h-8 px-2.5 text-bad"
                    onclick={() => deleteDraftGrn(g.id)}
                    disabled={deletingGrnId === g.id}
                    aria-label="Delete draft"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                {:else}
                  <button
                    type="button"
                    class="btn btn-sm h-8 flex-1 text-xs"
                    onclick={() => openEditConfirmedGrnModal(g)}
                  >
                    <Pencil class="h-3 w-3" />
                    <span>Edit Info</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm h-8 px-2.5 text-xs"
                    onclick={() => {
                      navigator.clipboard?.writeText(g.id);
                      app.toast('GRN ID copied', 'info');
                    }}
                  >
                    <Copy class="h-3 w-3" />
                    <span>Copy ID</span>
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <!-- DESKTOP TABLE VIEW (`hidden md:block`) -->
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="border-b border-line bg-raised/50 text-[10px] font-bold uppercase tracking-wider text-dim">
              <tr>
                <th class="w-8 py-3 pl-4"></th>
                <th class="py-3 text-left">Date</th>
                <th class="py-3 text-left">Reference #</th>
                <th class="py-3 text-left">Supplier</th>
                <th class="py-3 text-left">Branch</th>
                <th class="py-3 text-right">Subtotal</th>
                <th class="py-3 text-right">Discount</th>
                <th class="py-3 text-right">Net Total</th>
                <th class="py-3 text-center">Invoice / Status</th>
                <th class="py-3 text-left">Received By</th>
                <th class="py-3 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              {#each historyList as g (g.id)}
                {@const tot = calcGrnTotals(g)}
                {@const invStatus = g.supplier_invoices?.[0]?.status}
                {@const isDraft = g.status === 'draft'}
                {@const isExpanded = expandedGrnId === g.id}
                <tr
                  class="cursor-pointer transition hover:bg-raised/30"
                  onclick={() => toggleExpandHistoryGrn(g.id)}
                >
                  <td class="py-3.5 pl-4">
                    {#if isExpanded}
                      <ChevronUp class="h-4 w-4 text-fg" />
                    {:else}
                      <ChevronDown class="h-4 w-4 text-dim" />
                    {/if}
                  </td>
                  <td class="py-3.5">
                    <div class="font-medium text-fg">{new Date(g.received_at).toLocaleDateString()}</div>
                    <div class="text-[10px] uppercase text-dim">
                      {new Date(g.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td class="py-3.5 font-mono text-xs text-fg">{g.reference_no || '—'}</td>
                  <td class="py-3.5 font-semibold text-fg">{g.suppliers?.name || '—'}</td>
                  <td class="py-3.5 text-muted">{g.locations?.name || '—'}</td>
                  <td class="py-3.5 text-right font-mono">Rs. {tot.subtotal.toLocaleString()}</td>
                  <td class="py-3.5 text-right font-mono text-bad">
                    {tot.disc > 0 ? `Rs. ${tot.disc.toLocaleString()}` : '—'}
                  </td>
                  <td class="py-3.5 text-right font-mono font-bold text-fg">Rs. {tot.netTotal.toLocaleString()}</td>
                  <td class="py-3.5 text-center">
                    {#if isDraft}
                      <span class="chip border-amber-500/40 bg-amber-500/15 py-0 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
                        Draft
                      </span>
                    {:else}
                      <span class="chip py-0 text-[10px] font-bold uppercase {invStatus === 'paid' ? 'border-ok/30 bg-ok/10 text-ok' : 'text-muted'}">
                        {invStatus ? invStatus.replace('_', ' ') : 'unpaid'}
                      </span>
                    {/if}
                  </td>
                  <td class="py-3.5 text-muted">{g.profiles?.name || '—'}</td>
                  <td class="py-3.5 pr-5 text-right" onclick={(e) => e.stopPropagation()}>
                    <div class="inline-flex items-center justify-end gap-1">
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm size-7 p-0 text-dim hover:text-fg"
                        onclick={() => {
                          navigator.clipboard?.writeText(g.id);
                          app.toast('GRN ID copied', 'info');
                        }}
                        title="Copy GRN ID"
                      >
                        <Copy class="h-3.5 w-3.5" />
                      </button>
                      {#if isDraft}
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm size-7 p-0 text-dim hover:text-fg"
                          onclick={() => loadDraftGrnForEditing(g)}
                          title="Edit Draft GRN"
                        >
                          <Pencil class="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm size-7 p-0 text-ok hover:bg-ok/10"
                          onclick={() => confirmDraftGrnFromHistory(g)}
                          disabled={confirmingGrnId === g.id}
                          title="Confirm GRN & Add to Stock"
                        >
                          <CircleCheckBig class="h-4 w-4 {confirmingGrnId === g.id ? 'animate-spin' : ''}" />
                        </button>
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm size-7 p-0 text-bad hover:bg-bad/10"
                          onclick={() => deleteDraftGrn(g.id)}
                          disabled={deletingGrnId === g.id}
                          title="Delete Draft"
                        >
                          <Trash2 class="h-4 w-4" />
                        </button>
                      {:else}
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm size-7 p-0 text-dim hover:text-fg"
                          onclick={() => openEditConfirmedGrnModal(g)}
                          title="Edit GRN Info"
                        >
                          <Pencil class="h-3.5 w-3.5" />
                        </button>
                      {/if}
                    </div>
                  </td>
                </tr>
                {#if isExpanded}
                  <tr class="bg-raised/30">
                    <td colspan="11" class="px-10 py-3">
                      {#if loadingExpandedItems}
                        <div class="text-xs text-muted italic">Loading items...</div>
                      {:else if expandedGrnItems.length === 0}
                        <div class="text-xs text-muted italic">No items found.</div>
                      {:else}
                        <div class="space-y-1">
                          <div class="text-[10px] font-bold uppercase tracking-wider text-dim mb-1.5">
                            Items Received ({expandedGrnItems.length} variants)
                          </div>
                          {#each expandedGrnItems as it (it.id)}
                            <div class="flex items-center justify-between border-b border-line/40 py-1 text-xs last:border-0">
                              <div>
                                <span class="font-semibold text-fg">{it.name}</span>
                                <span class="ml-2 font-mono text-dim">({it.sku}{it.size ? ` · Sz ${it.size}` : ''})</span>
                                {#if it.brand}
                                  <span class="ml-1 text-muted">— {it.brand}</span>
                                {/if}
                              </div>
                              <div class="font-mono text-xs text-muted">
                                ×{it.quantity_received} @ Rs.{it.unit_cost.toLocaleString()}
                              </div>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        {#if totalPages > 1}
          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-line p-4 text-xs">
            <div class="text-muted">
              Showing <strong class="text-fg">{(historyPage - 1) * PAGE_SIZE + 1}</strong> to
              <strong class="text-fg">{Math.min(historyPage * PAGE_SIZE, historyTotalCount)}</strong> of
              <strong class="text-fg">{historyTotalCount}</strong> GRNs
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="btn btn-sm h-8 px-2.5"
                disabled={historyPage <= 1}
                onclick={() => {
                  historyPage = Math.max(1, historyPage - 1);
                  fetchGrnHistory();
                }}
              >
                <ChevronLeft class="h-3.5 w-3.5" />
                <span>Previous</span>
              </button>
              <span class="font-mono text-xs font-semibold">Page {historyPage} of {totalPages}</span>
              <button
                type="button"
                class="btn btn-sm h-8 px-2.5"
                disabled={historyPage >= totalPages}
                onclick={() => {
                  historyPage = Math.min(totalPages, historyPage + 1);
                  fetchGrnHistory();
                }}
              >
                <span>Next</span>
                <ChevronRight class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<!-- ==================== EDIT CONFIRMED GRN METADATA MODAL ==================== -->
{#if editMetaGrn}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm">
    <div class="card w-full max-w-md overflow-hidden rounded-t-2xl sm:rounded-2xl shadow-2xl">
      <div class="flex items-center justify-between border-b border-line bg-raised px-4 py-3">
        <div>
          <h3 class="font-display text-sm font-bold text-fg">Edit GRN Info</h3>
          <p class="text-[11px] text-muted">Update reference, date, discount, or notes.</p>
        </div>
        <button class="btn btn-ghost btn-sm size-7 p-0" onclick={() => (editMetaGrn = null)}>
          <X class="size-4" />
        </button>
      </div>
      <div class="p-4 space-y-3 text-xs">
        <div class="space-y-1">
          <label for="em-ref" class="label">Reference #</label>
          <input id="em-ref" type="text" class="input h-9 text-xs font-mono" bind:value={editMetaRef} />
        </div>
        <div class="grid grid-cols-2 gap-2.5">
          <div class="space-y-1">
            <label for="em-date" class="label">GRN Date</label>
            <input id="em-date" type="date" class="input h-9 text-xs font-mono" bind:value={editMetaDate} />
          </div>
          <div class="space-y-1">
            <label for="em-disc" class="label">Discount (Rs.)</label>
            <input id="em-disc" type="number" class="input h-9 text-xs font-mono" bind:value={editMetaDiscount} />
          </div>
        </div>
        <div class="space-y-1">
          <label for="em-notes" class="label">Notes</label>
          <input id="em-notes" type="text" class="input h-9 text-xs" bind:value={editMetaNotes} placeholder="Arrival notes..." />
        </div>
      </div>
      <div class="flex gap-2 border-t border-line bg-surface p-3.5">
        <button type="button" class="btn flex-1 h-9 text-xs" onclick={() => (editMetaGrn = null)}>Cancel</button>
        <button
          type="button"
          class="btn btn-primary flex-1 h-9 text-xs font-bold"
          onclick={saveConfirmedGrnMetadata}
          disabled={editMetaBusy}
        >
          {editMetaBusy ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ==================== QUICK ADD SUPPLIER MODAL ==================== -->
{#if newSupplierOpen}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm">
    <div class="card w-full max-w-sm overflow-hidden rounded-t-2xl sm:rounded-2xl shadow-2xl">
      <div class="flex items-center justify-between border-b border-line bg-raised px-4 py-3">
        <h3 class="font-display text-sm font-bold text-fg">Add New Supplier / Vendor</h3>
        <button class="btn btn-ghost btn-sm size-7 p-0" onclick={() => (newSupplierOpen = false)}>
          <X class="size-4" />
        </button>
      </div>
      <div class="p-4 space-y-3 text-xs">
        <div class="space-y-1">
          <label for="ns-name" class="label">Supplier Name *</label>
          <input
            id="ns-name"
            type="text"
            class="input h-9 text-xs"
            placeholder="e.g. DSI Footwear / Bata"
            bind:value={newSupplierName}
          />
        </div>
        <div class="space-y-1">
          <label for="ns-phone" class="label">Phone Number (Optional)</label>
          <input
            id="ns-phone"
            type="text"
            class="input h-9 text-xs font-mono"
            placeholder="07..."
            bind:value={newSupplierPhone}
          />
        </div>
      </div>
      <div class="flex gap-2 border-t border-line bg-surface p-3.5">
        <button type="button" class="btn flex-1 h-9 text-xs" onclick={() => (newSupplierOpen = false)}>Cancel</button>
        <button
          type="button"
          class="btn btn-primary flex-1 h-9 text-xs font-bold"
          onclick={saveNewSupplier}
          disabled={newSupplierBusy}
        >
          {newSupplierBusy ? 'Adding...' : 'Add Supplier'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ==================== ADD NEW PRODUCT & VARIANTS MODAL (`rL` in 048._yz._dgjl.js) ==================== -->
{#if newProductOpen}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm">
    <div class="card flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl shadow-2xl">
      <div class="flex items-center justify-between border-b border-line bg-raised px-4 py-3.5 shrink-0">
        <div>
          <h3 class="font-display text-base font-bold text-fg">Add New Product to Catalogue</h3>
          <p class="text-[11px] text-muted">Register a shoe model and its size/color variants.</p>
        </div>
        <button class="btn btn-ghost btn-sm size-8 p-0" onclick={() => (newProductOpen = false)}>
          <X class="size-4" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
        <!-- Basic Information -->
        <div class="space-y-3">
          <div class="text-[11px] font-bold uppercase tracking-wider text-dim">Basic Information</div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div class="space-y-1 sm:col-span-2">
              <label for="np-name" class="label">Product Name / Shoe Code *</label>
              <input
                id="np-name"
                type="text"
                class="input h-10 text-xs font-medium"
                placeholder="e.g. Air Jordan 1 or SFW099"
                bind:value={npName}
              />
            </div>

            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <label for="np-brand" class="label mb-0">Brand *</label>
                <button
                  type="button"
                  class="text-[10px] font-bold text-ok hover:underline cursor-pointer"
                  onclick={() => (addingBrandInline = !addingBrandInline)}
                >
                  {addingBrandInline ? 'Cancel' : '+ New'}
                </button>
              </div>
              {#if addingBrandInline}
                <div class="flex gap-1">
                  <input type="text" class="input h-10 flex-1 text-xs" placeholder="Brand..." bind:value={inlineBrandName} />
                  <button type="button" class="btn btn-primary btn-sm h-10 px-2.5" onclick={createInlineBrand}>Add</button>
                </div>
              {:else}
                <select id="np-brand" class="input h-10 text-xs" bind:value={npBrand}>
                  <option value="">Select Brand</option>
                  {#each allBrands as b (b)}
                    <option value={b}>{b}</option>
                  {/each}
                </select>
              {/if}
            </div>

            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <label for="np-cat" class="label mb-0">Category</label>
                <button
                  type="button"
                  class="text-[10px] font-bold text-ok hover:underline cursor-pointer"
                  onclick={() => (addingCategoryInline = !addingCategoryInline)}
                >
                  {addingCategoryInline ? 'Cancel' : '+ New'}
                </button>
              </div>
              {#if addingCategoryInline}
                <div class="flex gap-1">
                  <input type="text" class="input h-10 flex-1 text-xs" placeholder="Category..." bind:value={inlineCategoryName} />
                  <button type="button" class="btn btn-primary btn-sm h-10 px-2.5" onclick={createInlineCategory}>Add</button>
                </div>
              {:else}
                <select id="np-cat" class="input h-10 text-xs" bind:value={npCategory}>
                  {#each allCategories as c (c)}
                    <option value={c}>{c}</option>
                  {/each}
                </select>
              {/if}
            </div>

            <div class="space-y-1">
              <label for="np-gender" class="label">Gender</label>
              <select id="np-gender" class="input h-10 text-xs" bind:value={npGender}>
                <option value="men">Men</option>
                <option value="women">Women</option>
                <option value="unisex">Unisex</option>
                <option value="kids">Kids</option>
              </select>
            </div>

            <div class="space-y-1">
              <label for="np-desc" class="label">Description (Optional)</label>
              <input
                id="np-desc"
                type="text"
                class="input h-10 text-xs"
                placeholder="Notes or material..."
                bind:value={npDescription}
              />
            </div>
          </div>
        </div>

        <!-- Product Variants -->
        <div class="space-y-3 border-t border-line pt-4">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-dim">
              Product Variants ({npVariants.length})
            </span>
            <button
              type="button"
              class="btn btn-sm h-8 px-3 text-xs font-semibold"
              onclick={addNpVariantRow}
            >
              <Plus class="h-3.5 w-3.5 text-ok" />
              <span>+ Add Size Variant</span>
            </button>
          </div>

          <div class="space-y-3">
            {#each npVariants as vRow, idx}
              <div class="rounded-xl border border-line bg-raised/30 p-3 space-y-2.5">
                <div class="flex items-center justify-between">
                  <span class="font-mono text-[10px] font-bold uppercase text-dim">Variant #{idx + 1}</span>
                  {#if npVariants.length > 1}
                    <button
                      type="button"
                      class="text-[11px] text-bad hover:underline flex items-center gap-1 cursor-pointer"
                      onclick={() => removeNpVariantRow(idx)}
                    >
                      <Trash2 class="h-3 w-3" />
                      <span>Remove</span>
                    </button>
                  {/if}
                </div>

                <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
                  <div class="col-span-2 sm:col-span-1 space-y-1">
                    <label class="text-[10px] font-bold uppercase text-dim" for="npv-sku-{idx}">SKU Code *</label>
                    <input
                      id="npv-sku-{idx}"
                      type="text"
                      class="input h-9 font-mono text-xs"
                      placeholder="Auto if blank"
                      bind:value={vRow.sku}
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold uppercase text-dim" for="npv-sz-{idx}">Size</label>
                    <input
                      id="npv-sz-{idx}"
                      type="text"
                      class="input h-9 text-center font-mono text-xs font-bold"
                      placeholder="e.g. 42"
                      bind:value={vRow.size}
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold uppercase text-dim" for="npv-col-{idx}">Color</label>
                    <input
                      id="npv-col-{idx}"
                      type="text"
                      class="input h-9 text-xs"
                      placeholder="Black"
                      bind:value={vRow.colour}
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold uppercase text-dim" for="npv-cost-{idx}">Cost *</label>
                    <input
                      id="npv-cost-{idx}"
                      type="number"
                      class="input h-9 font-mono text-xs"
                      placeholder="0"
                      bind:value={vRow.cost_price}
                    />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold uppercase text-ok" for="npv-sell-{idx}">Sale Price *</label>
                    <input
                      id="npv-sell-{idx}"
                      type="number"
                      class="input h-9 font-mono text-xs font-bold"
                      placeholder="0"
                      bind:value={vRow.selling_price}
                    />
                  </div>
                  <div class="col-span-2 sm:col-span-1 space-y-1">
                    <div class="flex items-center justify-between">
                      <label class="text-[10px] font-bold uppercase text-dim" for="npv-bc-{idx}">Barcode</label>
                      <button
                        type="button"
                        class="text-[10px] font-semibold text-ok hover:underline cursor-pointer"
                        onclick={() => generateVariantBarcodeFromSku(idx)}
                        title="Generate barcode from SKU"
                      >
                        Auto
                      </button>
                    </div>
                    <input
                      id="npv-bc-{idx}"
                      type="text"
                      class="input h-9 font-mono text-xs"
                      placeholder="Barcode"
                      bind:value={vRow.barcode}
                    />
                  </div>
                </div>

                {#if npAddToGrn}
                  <div class="flex items-center justify-end gap-2 pt-1 border-t border-line/40">
                    <label class="text-[10px] font-bold uppercase text-muted" for="npv-qty-{idx}">
                      GRN Qty to Receive:
                    </label>
                    <input
                      id="npv-qty-{idx}"
                      type="number"
                      min="1"
                      class="input h-7 w-16 text-center font-mono text-xs font-bold"
                      bind:value={vRow.qty}
                    />
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <label class="flex items-center gap-2 rounded-lg border border-line bg-raised/50 p-3 cursor-pointer">
          <input type="checkbox" class="size-4 accent-emerald-600" bind:checked={npAddToGrn} />
          <span class="text-xs font-semibold text-fg">
            Automatically add these new variants into the current GRN shipment
          </span>
        </label>
      </div>

      <div class="flex gap-2.5 border-t border-line bg-surface p-4 shrink-0">
        <button type="button" class="btn flex-1 h-10 text-xs" onclick={() => (newProductOpen = false)}>
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary flex-[2] h-10 text-xs font-bold"
          onclick={submitNewProductCatalog}
          disabled={npBusy}
        >
          {#if npBusy}
            <Loader2 class="h-4 w-4 animate-spin" />
            <span>Registering...</span>
          {:else}
            <Check class="h-4 w-4" />
            <span>{npAddToGrn ? 'Register Product & Add to GRN' : 'Register Product'}</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if cameraOpen}
  <CameraScanner onscan={handleBarcodeScan} onclose={() => (cameraOpen = false)} />
{/if}
