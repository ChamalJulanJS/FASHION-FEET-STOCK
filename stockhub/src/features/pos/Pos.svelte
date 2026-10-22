<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    ShoppingBag, Store, ChevronDown, Check, Search, X, Camera, Zap, Plus, Minus,
    Trash2, Printer, MessageCircle, CreditCard, Banknote, QrCode, Split, User,
    Phone, RefreshCw, Receipt, Ban, Loader2, Sparkles, PackagePlus, Layers, AlertCircle,
    Glasses,
  } from 'lucide-svelte';
  import { app, getShoeDisplaySize, fmtMoney } from '../../lib/app.svelte';
  import { restGet, restWrite } from '../../lib/api';
  import { SoundFx } from '../../lib/sound';
  import type { Variant } from '../../lib/types';
  import { extractBaseSkuAndSize } from '../stockcount/logic';
  import CameraScanner from '../transfer/CameraScanner.svelte';
  import ReceiptModal from './ReceiptModal.svelte';
  import {
    type PaymentMethod,
    type PosLine,
    type PosCustomer,
    type PosReceiptDetails,
    loadPosDraft,
    savePosDraft,
    clearPosDraft,
    formatInvoiceNo,
    printPosThermalReceipt,
    loadAutoPcPrint,
    saveAutoPcPrint,
    sendReceiptToPcPrinter,
    waitForPrintJobStatus,
    checkCounterPcStatus,
  } from './logic';

  // ---------------- state ----------------
  let locationId = $state('');
  let locDropdownOpen = $state(false);
  let counterPcOnline = $state<boolean | null>(null);
  let lines = $state<PosLine[]>([]);
  let discountVal = $state('');
  let discountMode = $state<'fixed' | 'pct'>('fixed');
  let paymentMethod = $state<PaymentMethod>('cash');
  let cashReceived = $state('');
  let customer = $state<PosCustomer | null>(null);
  let whatsappPhone = $state('');
  let autoPcPrint = $state(true);
  let sendingPcSaleId = $state<string | null>(null);

  // Search & Scanner state
  let query = $state('');
  let debounced = $state('');
  let showResults = $state(false);
  let cameraOpen = $state(false);
  let activeModelProductId = $state<string | null>(null);
  let searchInput: HTMLInputElement | undefined = $state();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Customer search / quick add
  let custQuery = $state('');
  let custResults = $state<PosCustomer[]>([]);
  let custBusy = $state(false);
  let newCustOpen = $state(false);
  let newCustName = $state('');
  let newCustPhone = $state('');

  // Emergency Quick Add (100% Desktop POS Parity)
  let quickAddOpen = $state(false);
  let qaExistingProductId = $state<string | null>(null);
  let qaName = $state('');
  let qaSku = $state('');
  let qaBrand = $state('');
  let qaCategory = $state('Casual');
  let qaSize = $state('');
  let qaColour = $state('');
  let qaPrice = $state('');
  let qaCost = $state('');
  let qaInitialStock = $state('1');
  let qaBarcode = $state('');
  let qaBusy = $state(false);
  let dbBrands = $state<string[]>([]);
  let dbCategories = $state<string[]>([]);
  let addingBrandOpen = $state(false);
  let newBrandName = $state('');
  let addingCategoryOpen = $state(false);
  let newCategoryName = $state('');

  // Checkout & History state
  let busy = $state(false);
  let activeReceipt = $state<PosReceiptDetails | null>(null);
  let receiptIsSuccess = $state(false);
  let recentSales = $state<any[]>([]);
  let loadingSales = $state(false);
  let voidingSaleId = $state<string | null>(null);
  let billSection: HTMLElement | undefined = $state();

  // Recent Bills Detail View & Filters state
  let recentViewMode = $state<'detailed' | 'compact'>('detailed');
  let recentDateFilter = $state<'today' | 'yesterday' | '7days' | 'all'>('all');
  let recentPaymentFilter = $state<'all' | 'cash' | 'card'>('all');
  let recentSearch = $state('');
  let expandedSaleIds = $state<Record<string, boolean>>({});

  // ---------------- lifecycle & persistence ----------------
  let draftLoaded = false;
  let counterPcCheckTimer: ReturnType<typeof setInterval> | undefined;

  async function updateCounterPcStatus() {
    if (!locationId) {
      counterPcOnline = null;
      return;
    }
    try {
      const res = await checkCounterPcStatus(locationId);
      counterPcOnline = res.online;
    } catch {
      // silent
    }
  }

  async function loadBrandsAndCategories() {
    try {
      const [bRes, cRes] = await Promise.all([
        restGet<{ name: string }[]>('brands?select=name&order=name.asc'),
        restGet<{ name: string }[]>('categories?select=name&order=name.asc'),
      ]);
      if (bRes) dbBrands = bRes.map((b) => b.name).filter(Boolean);
      if (cRes) dbCategories = cRes.map((c) => c.name).filter(Boolean);
    } catch (e) {
      console.warn('Could not load brands/categories:', e);
    }
  }

  onMount(() => {
    autoPcPrint = loadAutoPcPrint();
    loadBrandsAndCategories();
    const saved = loadPosDraft();
    if (saved) {
      if (saved.locationId) locationId = saved.locationId;
      if (Array.isArray(saved.lines)) lines = saved.lines;
      if (saved.discountVal) discountVal = saved.discountVal;
      if (saved.discountMode) discountMode = saved.discountMode;
      if (saved.paymentMethod) paymentMethod = saved.paymentMethod;
      if (saved.cashReceived) cashReceived = saved.cashReceived;
      if (saved.customer) customer = saved.customer;
      if (saved.whatsappPhone) whatsappPhone = saved.whatsappPhone;
    }
    draftLoaded = true;
    updateCounterPcStatus();
    counterPcCheckTimer = setInterval(updateCounterPcStatus, 15000);
    return () => {
      if (counterPcCheckTimer) clearInterval(counterPcCheckTimer);
    };
  });

  // Resolve default location once app.locations are loaded
  $effect(() => {
    if (!locationId && app.locations.length > 0) {
      if (app.currentUser?.location_id) {
        locationId = app.currentUser.location_id;
      } else {
        const gallery = app.locations.find((l) => l.name.toLowerCase().includes('shoe gallery'));
        locationId = gallery?.id || app.fromId || app.locations[0].id;
      }
    }
  });

  // Auto-save draft whenever bill state changes
  $effect(() => {
    if (!draftLoaded) return;
    savePosDraft({
      locationId,
      lines,
      discountVal,
      discountMode,
      paymentMethod,
      cashReceived,
      customer,
      whatsappPhone,
    });
  });

  // Fetch recent sales and PC status when location changes
  $effect(() => {
    if (locationId) {
      fetchRecentSales(locationId);
      updateCounterPcStatus();
    }
  });

  // ---------------- derived values ----------------
  const activeLoc = $derived(app.locations.find((l) => l.id === locationId));

  const totalPairs = $derived(lines.reduce((s, l) => s + l.qty, 0));
  const subtotal = $derived(lines.reduce((s, l) => s + (l.unitPrice - (l.itemDiscount || 0)) * l.qty, 0));

  const discountAmount = $derived.by(() => {
    const v = parseFloat(String(discountVal)) || 0;
    if (v <= 0) return 0;
    if (discountMode === 'pct') {
      return Math.min(subtotal, Math.round((subtotal * Math.min(100, v)) / 100));
    }
    return Math.min(subtotal, v);
  });

  const grandTotal = $derived(Math.max(0, subtotal - discountAmount));

  const cashReceivedNum = $derived(parseFloat(String(cashReceived)) || 0);
  const changeAmount = $derived(cashReceivedNum > grandTotal ? cashReceivedNum - grandTotal : 0);
  const splitCardBalance = $derived(
    paymentMethod === 'split' && cashReceivedNum < grandTotal ? grandTotal - cashReceivedNum : 0,
  );

  // Merged brands and categories from DB + catalog
  const allBrands = $derived.by(() => {
    const s = new Set<string>(dbBrands);
    for (const v of app.catalog) {
      if (v.products?.brand) s.add(v.products.brand);
    }
    return Array.from(s).filter(Boolean).sort((a, b) => a.localeCompare(b));
  });

  const allCategories = $derived.by(() => {
    const s = new Set<string>(dbCategories.length > 0 ? dbCategories : ['Casual', 'Formal', 'Sports', 'Sandals', 'Slippers', 'Kids', 'Ladies', 'Gents']);
    for (const v of app.catalog) {
      if (v.products?.category) s.add(v.products.category);
    }
    return Array.from(s).filter(Boolean).sort((a, b) => a.localeCompare(b));
  });

  // Active shoe model siblings for 1-tap size bar
  const activeModelSiblings = $derived.by(() => {
    if (!activeModelProductId) return [];
    const list = app.productsMap.get(activeModelProductId) || [];
    return [...list].sort((a, b) => {
      const na = parseFloat(String(a.size || ''));
      const nb = parseFloat(String(b.size || ''));
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a.size || '').localeCompare(String(b.size || ''));
    });
  });

  function toLocalDateKey(isoStr?: string): string {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr.slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Today's sales stats from recentSales
  const todayStats = $derived.by(() => {
    const todayStr = toLocalDateKey(new Date().toISOString());
    let count = 0;
    let revenue = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    for (const s of recentSales) {
      if (s.status === 'cancelled') continue;
      const dStr = toLocalDateKey(s.created_at);
      if (dStr === todayStr) {
        count++;
        const tot = Number(s.total) || 0;
        revenue += tot;
        if (s.payment_method === 'card') cardTotal += tot;
        else cashTotal += tot;
      }
    }
    return { count, revenue, cashTotal, cardTotal };
  });

  // ---------------- product search & barcode scan ----------------
  function runSearch(raw: string): Variant[] {
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
      const dispSz = getShoeDisplaySize(v.size, v.products);
      const sizeMatch = (v.size && v.size.toString().trim() === q) || dispSz.toUpperCase().includes(q);
      return barcodeMatch || skuMatch || nameMatch || brandMatch || sizeMatch;
    });

    matches.sort((x, y) => {
      const xExact = (x.barcode && x.barcode.toUpperCase() === q) || (x.sku && x.sku.toUpperCase() === q);
      const yExact = (y.barcode && y.barcode.toUpperCase() === q) || (y.sku && y.sku.toUpperCase() === q);
      if (xExact && !yExact) return -1;
      if (!xExact && yExact) return 1;
      return app.getStock(y.id, locationId) - app.getStock(x.id, locationId);
    });

    return matches.slice(0, 25);
  }

  const results = $derived(runSearch(debounced));
  const queryActive = $derived(debounced.trim().length >= 2);

  function onSearchInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounced = query;
      showResults = true;
    }, 100);
  }

  function resetSearch() {
    query = '';
    debounced = '';
    showResults = false;
  }

  function addVariantToBill(v: Variant, qty = 1) {
    const avail = app.getStock(v.id, locationId);
    const pId = v.product_id || v.products?.id || null;
    if (pId) activeModelProductId = pId;

    const idx = lines.findIndex((l) => l.variant.id === v.id);
    if (idx >= 0) {
      lines[idx].qty += qty;
      lines[idx].availableStock = avail;
    } else {
      lines.unshift({
        variant: v,
        qty,
        unitPrice: Number(v.selling_price) || 0,
        itemDiscount: 0,
        availableStock: avail,
      });
    }
    SoundFx.scan();
    const dispSz = getShoeDisplaySize(v.size, v.products);
    if (avail <= 0) {
      app.toast(`"${v.products?.name || v.sku}" (Sz ${dispSz}) has 0 stock in branch — added to bill!`, 'warning');
    } else {
      app.toast(`+${qty} added: ${v.products?.name || v.sku} (Sz ${dispSz})`, 'success');
    }
  }

  async function saveLinePriceToDb(v: Variant, newPrice: number) {
    if (isNaN(newPrice) || newPrice < 0) return;
    if (Number(v.selling_price) === newPrice) return;
    try {
      await restWrite('PATCH', `product_variants?id=eq.${v.id}`, {
        selling_price: newPrice,
      });
      v.selling_price = newPrice;
      app.toast(`Price updated to Rs. ${newPrice.toLocaleString()}`, 'success');
    } catch (e: any) {
      app.toast('Failed to save price: ' + (e.message || 'Error'), 'error');
    }
  }

  async function quickAddStockToBranchAndBill(v: Variant, addQty = 1) {
    if (!locationId) {
      app.toast('Please select an active branch first.', 'warning');
      return;
    }
    try {
      const existing = await restGet<{ id: string; quantity: number }[]>(
        `stock_levels?variant_id=eq.${v.id}&location_id=eq.${locationId}&select=id,quantity`,
      );
      let newQty = addQty;
      if (existing && existing.length > 0) {
        newQty = Math.max(0, Number(existing[0].quantity)) + addQty;
        await restWrite('PATCH', `stock_levels?id=eq.${existing[0].id}`, {
          quantity: newQty,
        });
      } else {
        await restWrite('POST', 'stock_levels', {
          variant_id: v.id,
          location_id: locationId,
          quantity: newQty,
        });
      }
      await restWrite('POST', 'stock_movements', {
        variant_id: v.id,
        to_location: locationId,
        quantity: addQty,
        type: 'stock_adjustment',
        created_by: app.currentUser?.id || null,
      });
      app.stockMap.set(`${v.id}_${locationId}`, newQty);
      app.syncVersion++;
      addVariantToBill(v, addQty);
      app.toast(`Added +${addQty} stock to branch & added to bill!`, 'success');
    } catch (e: any) {
      app.toast('Could not add branch stock: ' + (e.message || 'Error'), 'error');
    }
  }

  function openEmergencyQuickAdd(rawCode = '', sizeHint = '') {
    qaExistingProductId = null;
    qaBarcode = rawCode.trim();
    qaName = rawCode.trim();
    qaSku = '';
    qaBrand = allBrands[0] || '';
    qaCategory = allCategories[0] || 'Casual';
    qaSize = sizeHint;
    qaColour = '';
    qaCost = '';
    qaPrice = '';
    qaInitialStock = '1';
    addingBrandOpen = false;
    addingCategoryOpen = false;
    quickAddOpen = true;
  }

  function openQuickAddSizeForModel(prodId: string) {
    const siblings = app.productsMap.get(prodId) || [];
    const sample = siblings[0];
    qaExistingProductId = prodId;
    qaBarcode = '';
    qaName = sample?.products?.name || sample?.sku || '';
    qaSku = '';
    qaBrand = sample?.products?.brand || allBrands[0] || '';
    qaCategory = sample?.products?.category || allCategories[0] || 'Casual';
    qaSize = '';
    qaColour = sample?.colour || '';
    qaCost = sample?.cost_price ? String(sample.cost_price) : '';
    qaPrice = sample?.selling_price ? String(sample.selling_price) : '';
    qaInitialStock = '1';
    addingBrandOpen = false;
    addingCategoryOpen = false;
    quickAddOpen = true;
  }

  function handleBarcodeScan(raw: string) {
    if (!raw || !raw.trim()) return;
    cameraOpen = false;
    const q = raw.trim().toUpperCase();

    // 1. Exact barcode or SKU match
    const exact = app.catalog.find(
      (v) => (v.barcode && v.barcode.toUpperCase() === q) || (v.sku && v.sku.toUpperCase() === q),
    );
    if (exact) {
      addVariantToBill(exact, 1);
      resetSearch();
      return;
    }

    // 2. Smart last-2-digits size splitter (e.g. SFW00641 -> Base SFW006, Size 41)
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
        addVariantToBill(matchBySize, 1);
        resetSearch();
        return;
      }
    }

    // 3. Single search match
    const found = runSearch(raw);
    if (found.length === 1) {
      addVariantToBill(found[0], 1);
      resetSearch();
      return;
    }

    if (found.length > 1) {
      // Show model's size bar and search results
      const pId = found[0].product_id || found[0].products?.id || null;
      if (pId) activeModelProductId = pId;
      query = raw;
      debounced = raw;
      showResults = true;
      SoundFx.scan();
      return;
    }

    // 4. Not in catalog -> Offer Emergency Quick Add (exact Desktop POS behaviour)!
    openEmergencyQuickAdd(baseSku || raw.trim(), size || '');
    qaBarcode = raw.trim();
    resetSearch();
    SoundFx.warning();
    app.toast(`"${raw.trim()}" not found in system — Emergency Quick Add opened!`, 'warning');
  }

  function changeLineQty(idx: number, delta: number) {
    const line = lines[idx];
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) {
      lines.splice(idx, 1);
    }
  }

  function removeLine(idx: number) {
    lines.splice(idx, 1);
  }

  function clearBill() {
    if (lines.length === 0) return;
    lines = [];
    discountVal = '';
    cashReceived = '';
    customer = null;
    whatsappPhone = '';
    clearPosDraft();
    app.toast('Bill cleared.', 'info');
  }

  // ---------------- customer lookup & quick create ----------------
  let custDebounce: ReturnType<typeof setTimeout> | undefined;
  function onCustSearchInput() {
    clearTimeout(custDebounce);
    // If user typed a phone number directly, sync it with whatsappPhone
    if (/^\d[\d\s+-]{6,}$/.test(custQuery.trim())) {
      whatsappPhone = custQuery.trim();
    }
    if (custQuery.trim().length < 3) {
      custResults = [];
      return;
    }
    custDebounce = setTimeout(async () => {
      try {
        const q = custQuery.trim();
        const data = await restGet<PosCustomer[]>(
          `customers?or=(name.ilike.*${encodeURIComponent(q)}*,phone.ilike.*${encodeURIComponent(q)}*)&limit=5`,
        );
        custResults = data || [];
      } catch {
        custResults = [];
      }
    }, 250);
  }

  async function saveNewCustomer() {
    if (!newCustName.trim()) {
      app.toast('Please enter customer name.', 'warning');
      return;
    }
    custBusy = true;
    try {
      const created = await restWrite<PosCustomer[]>('POST', 'customers', {
        name: newCustName.trim(),
        phone: newCustPhone.trim() || '0000000000',
        total_spend: 0,
      });
      const c = Array.isArray(created) ? created[0] : (created as any);
      if (c) {
        customer = c;
        whatsappPhone = c.phone || '';
        newCustOpen = false;
        newCustName = '';
        newCustPhone = '';
        app.toast(`Customer "${c.name}" added!`, 'success');
      }
    } catch (e: any) {
      app.toast('Failed to save customer: ' + (e.message || 'Error'), 'error');
    } finally {
      custBusy = false;
    }
  }

  async function createQuickBrand() {
    const b = newBrandName.trim();
    if (!b) return;
    try {
      await restWrite('POST', 'brands', { name: b });
      dbBrands = [...dbBrands, b].sort((x, y) => x.localeCompare(y));
      qaBrand = b;
      newBrandName = '';
      addingBrandOpen = false;
      app.toast(`Brand "${b}" added!`, 'success');
    } catch (e: any) {
      qaBrand = b;
      newBrandName = '';
      addingBrandOpen = false;
    }
  }

  async function createQuickCategory() {
    const c = newCategoryName.trim();
    if (!c) return;
    try {
      await restWrite('POST', 'categories', { name: c });
      dbCategories = [...dbCategories, c].sort((x, y) => x.localeCompare(y));
      qaCategory = c;
      newCategoryName = '';
      addingCategoryOpen = false;
      app.toast(`Category "${c}" added!`, 'success');
    } catch (e: any) {
      qaCategory = c;
      newCategoryName = '';
      addingCategoryOpen = false;
    }
  }

  // ---------------- emergency quick add item (100% Desktop POS Parity) ----------------
  function generateDesktopPosSku(category: string, name: string): string {
    const r = (category || '').slice(0, 3).toUpperCase() || 'SHO';
    const o = name
      .split(' ')
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(Boolean);
    const l = o.length > 0 && o[0].length >= 3 ? o[0].slice(0, 3).toUpperCase() : 'XXX';
    const c = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${r}-${l}-${c}`;
  }

  async function submitQuickAdd() {
    if (!qaName.trim()) {
      app.toast('Product name is required', 'warning');
      return;
    }
    const priceNum = parseFloat(String(qaPrice)) || 0;
    if (priceNum <= 0) {
      app.toast('Selling price is required', 'warning');
      return;
    }
    qaBusy = true;
    try {
      const costNum = parseFloat(String(qaCost)) || 0;
      const initStock = Math.max(0, parseInt(String(qaInitialStock)) || 0);
      const skuCode = qaSku.trim()
        ? qaSku.trim().toUpperCase()
        : generateDesktopPosSku(qaCategory, qaName.trim());

      let prodId = qaExistingProductId;
      let prodObj: { id: string; name: string; brand: string | null; category: string | null };

      if (prodId) {
        const existingSibs = app.productsMap.get(prodId) || [];
        const p = existingSibs[0]?.products;
        prodObj = {
          id: prodId,
          name: p?.name || qaName.trim(),
          brand: p?.brand || qaBrand.trim() || null,
          category: p?.category || qaCategory.trim() || 'Casual',
        };
      } else {
        // 1. Insert product (exact Desktop POS payload)
        const prodRes = await restWrite<any[]>('POST', 'products', {
          name: qaName.trim(),
          brand: qaBrand.trim() || null,
          category: qaCategory.trim() || 'Casual',
          status: 'active',
        });
        const createdProd = Array.isArray(prodRes) ? prodRes[0] : prodRes;
        prodId = createdProd.id;
        prodObj = {
          id: createdProd.id,
          name: createdProd.name,
          brand: createdProd.brand,
          category: createdProd.category,
        };
      }

      // 2. Insert product_variant (exact Desktop POS payload)
      const varRes = await restWrite<any[]>('POST', 'product_variants', {
        product_id: prodObj.id,
        sku: skuCode,
        barcode: qaBarcode.trim() || null,
        size: qaSize.trim() || null,
        colour: qaColour.trim() || null,
        cost_price: costNum,
        selling_price: priceNum,
      });
      const newVarRaw = Array.isArray(varRes) ? varRes[0] : varRes;

      // 3. Insert initial stock into stock_levels & stock_movements (exact Desktop POS behaviour!)
      if (initStock > 0 && locationId) {
        await restWrite('POST', 'stock_levels', {
          variant_id: newVarRaw.id,
          location_id: locationId,
          quantity: initStock,
        });
        await restWrite('POST', 'stock_movements', {
          variant_id: newVarRaw.id,
          to_location: locationId,
          quantity: initStock,
          type: 'stock_adjustment',
          created_by: app.currentUser?.id || null,
        });
        app.stockMap.set(`${newVarRaw.id}_${locationId}`, initStock);
      }

      const fullVariant: Variant = {
        ...newVarRaw,
        products: {
          id: prodObj.id,
          name: prodObj.name,
          brand: prodObj.brand || undefined,
          category: prodObj.category || undefined,
        },
      };

      // 4. Add to local catalog & bill
      app.catalog.unshift(fullVariant);
      const existingList = app.productsMap.get(prodObj.id) || [];
      app.productsMap.set(prodObj.id, [...existingList, fullVariant]);
      app.syncVersion++;

      addVariantToBill(fullVariant, 1);
      app.toast('Product quickly added and ready to sell!', 'success');

      quickAddOpen = false;
      qaExistingProductId = null;
      qaName = '';
      qaSku = '';
      qaSize = '';
      qaColour = '';
      qaPrice = '';
      qaCost = '';
      qaInitialStock = '1';
      qaBarcode = '';
    } catch (e: any) {
      app.toast('Failed to quick-add product: ' + (e.message || 'Error'), 'error');
    } finally {
      qaBusy = false;
    }
  }

  // ---------------- checkout saga (100% compatible with Desktop POS) ----------------
  async function completeSale(forcePcPrint = false) {
    if (lines.length === 0) {
      app.toast('Please add at least one shoe item to the bill!', 'warning');
      SoundFx.warning();
      return;
    }
    if (!locationId) {
      app.toast('Please select your active shop branch!', 'warning');
      return;
    }
    if (!app.currentUser) {
      app.toast('Please sign in to issue POS bills.', 'warning');
      app.openLogin(false);
      return;
    }

    busy = true;
    try {
      const snapshotLines = [...lines];
      const finalTotal = grandTotal;
      const finalDiscount = discountAmount;
      const finalSubtotal = subtotal;
      const finalCash = cashReceivedNum;
      const finalChange = changeAmount;
      const branchName = activeLoc?.name || 'Fashion Feet';
      const cashierId = app.currentUser?.id || null;
      const cashierName = app.currentUser?.name || 'Cashier';

      // 1. Insert into `sales`
      const salePayload: Record<string, any> = {
        location_id: locationId,
        customer_id: customer?.id || null,
        total: finalTotal,
        discount: finalDiscount,
        tax: 0,
        payment_method: paymentMethod === 'qr' ? 'card' : paymentMethod,
        status: 'completed',
      };
      if (cashierId) salePayload.cashier_id = cashierId;

      const saleRes = await restWrite<any[]>('POST', 'sales', salePayload);
      const saleRow = Array.isArray(saleRes) ? saleRes[0] : saleRes;
      if (!saleRow?.id) throw new Error('Sale record was not returned by database.');

      // 2. Insert `sale_items`, deduct `stock_levels`, and log `stock_movements`
      for (const l of snapshotLines) {
        const v = l.variant;
        const netUnitPrice = Math.max(0, l.unitPrice - (l.itemDiscount || 0));

        await restWrite('POST', 'sale_items', {
          sale_id: saleRow.id,
          variant_id: v.id,
          quantity: l.qty,
          unit_price: netUnitPrice,
          cost_price: Number(v.cost_price) || 0,
          discount: (l.itemDiscount || 0) * l.qty,
        });

        // Deduct from stock_levels
        const existingStock = await restGet<{ id: string; quantity: number }[]>(
          `stock_levels?variant_id=eq.${v.id}&location_id=eq.${locationId}&select=id,quantity`,
        );
        if (existingStock && existingStock.length > 0) {
          const newQty = Number(existingStock[0].quantity) - l.qty;
          await restWrite('PATCH', `stock_levels?id=eq.${existingStock[0].id}`, {
            quantity: newQty,
          });
          app.stockMap.set(`${v.id}_${locationId}`, newQty);
        } else {
          await restWrite('POST', 'stock_levels', {
            variant_id: v.id,
            location_id: locationId,
            quantity: -l.qty,
          });
          app.stockMap.set(`${v.id}_${locationId}`, -l.qty);
        }

        // Insert stock_movements
        const movPayload: Record<string, any> = {
          variant_id: v.id,
          from_location: locationId,
          quantity: l.qty,
          type: 'sale',
          reference_id: saleRow.id,
        };
        if (cashierId) movPayload.created_by = cashierId;
        await restWrite('POST', 'stock_movements', movPayload);
      }

      // 3. Update customer total_spend if attached
      if (customer?.id) {
        try {
          await restWrite('PATCH', `customers?id=eq.${customer.id}`, {
            total_spend: Number(customer.total_spend || 0) + finalTotal,
          });
        } catch (e) {
          console.warn('Customer spend update warning:', e);
        }
      }

      app.syncVersion++;
      SoundFx.success();

      // 4. Build Receipt Details
      const receiptData: PosReceiptDetails = {
        id: saleRow.id,
        invoiceNo: saleRow.invoice_no,
        date: new Date(saleRow.created_at || Date.now()).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        locationId,
        branchName,
        cashierName,
        customer,
        customerPhone: whatsappPhone || customer?.phone || '',
        paymentMethod,
        subtotal: finalSubtotal,
        discount: finalDiscount,
        grandTotal: finalTotal,
        cashReceived: finalCash,
        changeAmount: finalChange,
        items: snapshotLines.map((l) => {
          const netPrice = Math.max(0, l.unitPrice - (l.itemDiscount || 0));
          return {
            sku: l.variant.sku || '',
            name: l.variant.products?.name || l.variant.sku || 'Footwear',
            brand: l.variant.products?.brand || '',
            size: l.variant.size || '',
            displaySize: getShoeDisplaySize(l.variant.size, l.variant.products),
            colour: l.variant.colour || '',
            qty: l.qty,
            unitPrice: netPrice,
            lineTotal: netPrice * l.qty,
          };
        }),
      };

      // Reset current bill
      lines = [];
      discountVal = '';
      cashReceived = '';
      customer = null;
      whatsappPhone = '';
      custQuery = '';
      clearPosDraft();

      activeReceipt = receiptData;
      receiptIsSuccess = true;

      if (autoPcPrint || forcePcPrint) {
        const pcRes = await sendReceiptToPcPrinter(receiptData, locationId);
        if (pcRes.ok) {
          app.toast(pcRes.message, 'success');
          // If queued to dedicated print_jobs table, verify physical printing asynchronously
          if (pcRes.jobId && pcRes.queueType === 'print_jobs') {
            waitForPrintJobStatus(pcRes.jobId, 12000).then((statusRes) => {
              if (statusRes.status === 'printed') {
                SoundFx.success();
                app.toast(`✓ Invoice #${receiptData.invoiceNo || ''} Printed on Counter PC!`, 'success');
              } else if (statusRes.status === 'failed') {
                SoundFx.error();
                app.toast(`⚠ PC Printer Error: ${statusRes.error || 'Failed to print'}`, 'error');
              }
            });
          }
        } else {
          app.toast(pcRes.message, 'warning');
        }
      } else {
        app.toast(`Sale ${formatInvoiceNo(saleRow.invoice_no, saleRow.id)} completed!`, 'success');
      }
      fetchRecentSales(locationId);
    } catch (e: any) {
      console.error(e);
      SoundFx.error();
      app.toast('Checkout Error: ' + (e.message || 'Could not process sale'), 'error');
    } finally {
      busy = false;
    }
  }

  // ---------------- recent sales history & void/reprint ----------------
  async function fetchRecentSales(locId: string) {
    if (!locId) return;
    loadingSales = true;
    try {
      const data = await restGet<any[]>(
        `sales?location_id=eq.${locId}&select=id,invoice_no,total,discount,payment_method,status,created_at,customer_id,cashier_id,customers(id,name,phone),sale_items(id,variant_id,quantity,unit_price,cost_price,discount,product_variants(id,sku,size,colour,barcode,products(name,brand,category)))&order=created_at.desc&limit=50`,
      );
      recentSales = data || [];
    } catch (e) {
      console.warn('Could not load recent sales', e);
    } finally {
      loadingSales = false;
    }
  }

  function resolveSaleItems(s: any) {
    return (s.sale_items || []).map((si: any) => {
      const pv = Array.isArray(si.product_variants) ? si.product_variants[0] : si.product_variants;
      const prod = pv?.products ? (Array.isArray(pv.products) ? pv.products[0] : pv.products) : null;
      const v = app.catalog.find((c) => c.id === si.variant_id);
      const sku = pv?.sku || v?.sku || 'ITEM';
      const name = prod?.name || v?.products?.name || sku || 'Shoe Item';
      const brand = prod?.brand || v?.products?.brand || '';
      const category = prod?.category || v?.products?.category || '';
      const rawSize = pv?.size ?? v?.size ?? '';
      const displaySize = getShoeDisplaySize(rawSize, prod || v?.products);
      const colour = pv?.colour || v?.colour || '';
      const qty = Number(si.quantity) || 1;
      const unitPrice = Number(si.unit_price) || 0;
      const itemDisc = Number(si.discount) || 0;
      return {
        id: si.id || `${s.id}_${si.variant_id}`,
        variantId: si.variant_id,
        sku,
        name,
        brand,
        category,
        size: String(rawSize || ''),
        displaySize,
        colour,
        qty,
        unitPrice,
        itemDiscount: itemDisc,
        lineTotal: unitPrice * qty,
      };
    });
  }

  function resolveSaleCustomer(s: any): PosCustomer | null {
    const c = Array.isArray(s.customers) ? s.customers[0] : s.customers;
    if (c && (c.name || c.phone)) {
      return { id: c.id || s.customer_id || '', name: c.name || 'Customer', phone: c.phone || '' };
    }
    return null;
  }

  function resolveCashierName(s: any): string {
    const staffObj = app.allStaff.find((st) => st.id === s.cashier_id);
    if (staffObj?.name) return staffObj.name;
    if (app.currentUser?.id && app.currentUser.id === s.cashier_id) return app.currentUser.name;
    return 'Staff';
  }

  function toggleExpandSale(saleId: string) {
    expandedSaleIds[saleId] = !expandedSaleIds[saleId];
  }

  const filteredRecentSales = $derived.by(() => {
    const now = new Date();
    const todayKey = toLocalDateKey(now.toISOString());
    const yestDate = new Date(now.getTime() - 86400000);
    const yesterdayKey = toLocalDateKey(yestDate.toISOString());
    const sevenDaysAgoMs = now.getTime() - 7 * 86400000;
    const q = recentSearch.trim().toUpperCase();

    return recentSales.filter((s) => {
      // Date filter
      if (recentDateFilter === 'today') {
        if (toLocalDateKey(s.created_at) !== todayKey) return false;
      } else if (recentDateFilter === 'yesterday') {
        if (toLocalDateKey(s.created_at) !== yesterdayKey) return false;
      } else if (recentDateFilter === '7days') {
        const t = new Date(s.created_at).getTime();
        if (isNaN(t) || t < sevenDaysAgoMs) return false;
      }

      // Payment filter
      if (recentPaymentFilter !== 'all') {
        const pm = String(s.payment_method || 'cash').toLowerCase();
        if (pm !== recentPaymentFilter) return false;
      }

      // Search filter (Invoice No, SKU, Shoe Name, Brand, Size, Colour, Customer)
      if (q) {
        const invStr = formatInvoiceNo(s.invoice_no, s.id).toUpperCase();
        const rawInv = String(s.invoice_no || '').toUpperCase();
        const cust = resolveSaleCustomer(s);
        const custMatch =
          (cust?.name && cust.name.toUpperCase().includes(q)) ||
          (cust?.phone && cust.phone.toUpperCase().includes(q));
        const items = resolveSaleItems(s);
        const itemMatch = items.some(
          (it: any) =>
            it.sku.toUpperCase().includes(q) ||
            it.name.toUpperCase().includes(q) ||
            it.brand.toUpperCase().includes(q) ||
            it.displaySize.toUpperCase().includes(q) ||
            it.colour.toUpperCase().includes(q),
        );
        if (!invStr.includes(q) && !rawInv.includes(q) && !custMatch && !itemMatch) {
          return false;
        }
      }
      return true;
    });
  });

  const filteredSalesStats = $derived.by(() => {
    let activeBills = 0;
    let totalPairsSold = 0;
    let totalRevenue = 0;
    let cashRev = 0;
    let cardRev = 0;
    let totalDisc = 0;
    for (const s of filteredRecentSales) {
      if (s.status === 'cancelled') continue;
      activeBills++;
      const tot = Number(s.total) || 0;
      const disc = Number(s.discount) || 0;
      totalRevenue += tot;
      totalDisc += disc;
      if (s.payment_method === 'card') cardRev += tot;
      else cashRev += tot;
      for (const si of s.sale_items || []) {
        totalPairsSold += Number(si.quantity) || 0;
      }
    }
    return { activeBills, totalPairsSold, totalRevenue, cashRev, cardRev, totalDisc };
  });

  function buildReceiptFromPastSale(s: any): PosReceiptDetails {
    const branchName = activeLoc?.name || 'Fashion Feet';
    const items = resolveSaleItems(s);
    const cust = resolveSaleCustomer(s);
    const tot = Number(s.total) || 0;
    const disc = Number(s.discount) || 0;
    return {
      id: s.id,
      invoiceNo: s.invoice_no,
      date: new Date(s.created_at).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      locationId,
      branchName,
      cashierName: resolveCashierName(s),
      customer: cust,
      customerPhone: cust?.phone || '',
      paymentMethod: s.payment_method || 'cash',
      subtotal: tot + disc,
      discount: disc,
      grandTotal: tot,
      cashReceived: 0,
      changeAmount: 0,
      items,
    };
  }

  function openPastSaleReceipt(s: any) {
    activeReceipt = buildReceiptFromPastSale(s);
    receiptIsSuccess = false;
  }

  async function reprintPastSaleOnPc(s: any) {
    if (sendingPcSaleId) return;
    sendingPcSaleId = s.id;
    try {
      const r = buildReceiptFromPastSale(s);
      const res = await sendReceiptToPcPrinter(r, locationId);
      app.toast(res.message, res.ok ? 'success' : 'error');
      if (res.ok && res.jobId && res.queueType === 'print_jobs') {
        waitForPrintJobStatus(res.jobId, 12000).then((statusRes) => {
          if (statusRes.status === 'printed') {
            SoundFx.success();
            app.toast(`✓ Invoice #${r.invoiceNo || ''} Printed on Counter PC!`, 'success');
          } else if (statusRes.status === 'failed') {
            SoundFx.error();
            app.toast(`⚠ PC Printer Error: ${statusRes.error || 'Failed to print'}`, 'error');
          }
        });
      }
    } finally {
      sendingPcSaleId = null;
    }
  }

  async function voidSale(s: any) {
    if (!confirm(`Cancel Invoice ${formatInvoiceNo(s.invoice_no, s.id)} and restore stock to ${activeLoc?.name || 'branch'}?`)) {
      return;
    }
    voidingSaleId = s.id;
    try {
      // 1. Update sale status to cancelled
      await restWrite('PATCH', `sales?id=eq.${s.id}`, { status: 'cancelled' });

      // 2. Restore stock for each item
      for (const si of s.sale_items || []) {
        const qty = Number(si.quantity) || 0;
        if (qty <= 0 || !si.variant_id) continue;
        const existing = await restGet<{ id: string; quantity: number }[]>(
          `stock_levels?variant_id=eq.${si.variant_id}&location_id=eq.${locationId}&select=id,quantity`,
        );
        if (existing && existing.length > 0) {
          const restored = Number(existing[0].quantity) + qty;
          await restWrite('PATCH', `stock_levels?id=eq.${existing[0].id}`, {
            quantity: restored,
          });
          app.stockMap.set(`${si.variant_id}_${locationId}`, restored);
        }
      }
      app.syncVersion++;
      SoundFx.scan();
      app.toast(`Invoice ${formatInvoiceNo(s.invoice_no, s.id)} cancelled & stock restored!`, 'success');
      fetchRecentSales(locationId);
    } catch (e: any) {
      app.toast('Failed to cancel bill: ' + (e.message || 'Error'), 'error');
    } finally {
      voidingSaleId = null;
    }
  }
</script>

<svelte:window onclick={() => { locDropdownOpen = false; showResults = false; }} />

<div class="space-y-4">
  <!-- TOP HEADER: Branch Selector & Today's Live Sales Counter -->
  <div class="card p-4 sm:p-5">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex items-start gap-3">
        <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fg text-bg shadow-xs">
          <ShoppingBag class="h-5 w-5" />
        </div>
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="font-display text-base font-bold tracking-tight text-fg sm:text-lg">
              Mobile POS &amp; Instant Billing (ජංගම බිල්පත් පද්ධතිය)
            </h1>
            <span class="chip border-ok/30 bg-ok/10 text-ok font-semibold text-[10px]">
              Power-Backup Ready
            </span>
          </div>
          <p class="mt-0.5 text-xs text-muted">
            Issue official invoices from your phone · Deducts live branch stock · WhatsApp Digital Bill &amp; 80mm/58mm Thermal Print
          </p>
        </div>
      </div>

      <!-- Branch Selector + Today KPI Pills -->
      <div class="flex flex-wrap items-center gap-2">
        <!-- Branch Picker -->
        <div class="relative" onclick={(e) => e.stopPropagation()} role="presentation">
          <button
            type="button"
            class="btn h-9 gap-2 px-3 text-xs font-semibold"
            onclick={() => (locDropdownOpen = !locDropdownOpen)}
          >
            <Store class="h-3.5 w-3.5 text-ok" />
            <span>{activeLoc?.name || 'Select Branch'}</span>
            <ChevronDown class="h-3.5 w-3.5 text-dim" />
          </button>

          {#if locDropdownOpen}
            <div class="absolute right-0 z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
              <div class="border-b border-line bg-raised/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
                Billing Branch (ශාඛාව)
              </div>
              {#each app.locations as loc (loc.id)}
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-xs transition hover:bg-raised {loc.id === locationId ? 'bg-raised/70 font-bold text-fg' : 'text-muted'}"
                  onclick={() => {
                    locationId = loc.id;
                    locDropdownOpen = false;
                  }}
                >
                  <span>{loc.name}</span>
                  {#if loc.id === locationId}
                    <Check class="h-3.5 w-3.5 text-ok" />
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Today's Sales Summary Pill -->
        <div class="flex items-center gap-2 rounded-lg border border-line bg-raised/50 px-3 py-1.5 text-xs">
          <span class="text-muted">Today: <strong class="font-mono text-fg">{todayStats.count} Bills</strong></span>
          <span class="text-dim">·</span>
          <strong class="font-mono text-ok">{fmtMoney(todayStats.revenue)}</strong>
        </div>
      </div>
    </div>
  </div>

  <!-- MAIN POS WORKSPACE: 2-Column Grid (Left: Scanner + Basket, Right: Payment & Settlement) -->
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
    <!-- LEFT COLUMN: Scanner, 1-Tap Size Bar & Bill Items (7 cols) -->
    <div class="min-w-0 space-y-3.5 lg:col-span-7">
      <!-- Scanner & Search Card -->
      <div class="card p-4 space-y-3" onclick={(e) => e.stopPropagation()} role="presentation">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label for="pos-scanner-input" class="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <Search class="h-3.5 w-3.5 text-dim" />
            <span>Scan Barcode or Search Shoe Code</span>
          </label>

          <div class="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              class="btn btn-sm h-7 px-2.5 text-[11px] border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
              onclick={() => (app.arMeasureOpen = true)}
              title="WebXR 3D AR Foot Measure (Android/Samsung)"
            >
              <Glasses class="h-3.5 w-3.5" />
              <span>3D AR</span>
            </button>

            <button
              type="button"
              class="btn btn-sm h-7 px-2.5 text-[11px] border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
              onclick={() => openEmergencyQuickAdd(query)}
              title="Emergency Quick Add for items missing in branch or system"
            >
              <AlertCircle class="h-3.5 w-3.5 text-amber-500" />
              <span>Emergency Quick Add</span>
            </button>

            <button
              type="button"
              class="btn btn-primary btn-sm h-7 px-3 text-[11px]"
              onclick={() => (cameraOpen = true)}
            >
              <Camera class="h-3.5 w-3.5" />
              <span>Camera Scan</span>
            </button>
          </div>
        </div>

        <!-- Search Input Box -->
        <div class="relative">
          <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
          <input
            id="pos-scanner-input"
            bind:this={searchInput}
            type="text"
            class="input h-11 pl-10 pr-24 text-sm font-medium"
            placeholder="Scan barcode or type Shoe Code (e.g. SFW006, RD015, SL105)..."
            bind:value={query}
            oninput={onSearchInput}
            onfocus={() => { if (query.trim().length >= 2) showResults = true; }}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(debounceTimer);
                handleBarcodeScan(query);
              }
            }}
          />
          <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {#if query}
              <button
                type="button"
                class="grid size-7 cursor-pointer place-items-center rounded-md text-dim hover:bg-surface hover:text-fg"
                onclick={() => { resetSearch(); searchInput?.focus(); }}
                aria-label="Clear search"
              >
                <X class="size-3.5" />
              </button>
            {/if}
            <button
              type="button"
              class="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-fg transition hover:border-fg/30"
              onclick={() => (cameraOpen = true)}
            >
              <Camera class="size-3.5 text-ok" />
              <span>Scan</span>
            </button>
          </div>

          <!-- Search Results Dropdown -->
          {#if showResults && queryActive}
            <div class="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
              <div class="flex items-center justify-between border-b border-line bg-raised/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
                <span>Tap to Add to Bill</span>
                <span class="font-mono">{results.length} matches</span>
              </div>
              <ul class="max-h-80 divide-y divide-line overflow-y-auto">
                {#each results as v (v.id)}
                  {@const st = app.getStock(v.id, locationId)}
                  <li class="flex items-center justify-between gap-2 px-3.5 py-2.5 transition hover:bg-raised">
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 text-left"
                      onclick={() => {
                        addVariantToBill(v, 1);
                        resetSearch();
                      }}
                    >
                      <div class="min-w-0">
                        <div class="truncate text-xs font-bold text-fg">
                          {v.products?.brand ? `${v.products.brand} · ` : ''}{v.products?.name || v.sku}
                        </div>
                        <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          <span class="font-mono text-dim">{v.sku}</span>
                          <span class="chip py-0 text-[10px] font-bold text-fg">
                            Sz {getShoeDisplaySize(v.size, v.products)}
                          </span>
                          {#if v.colour}<span>{v.colour}</span>{/if}
                        </div>
                        <!-- All-branch stock pills -->
                        <div class="mt-1 flex flex-wrap items-center gap-1">
                          {#each app.locations as loc}
                            {@const q = app.getStock(v.id, loc.id)}
                            <span
                              class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 border text-[9px] font-mono {q > 0
                                ? 'border-ok/30 bg-ok/10 text-ok font-semibold'
                                : 'border-line/40 bg-surface/50 text-dim'}"
                            >
                              <span>{loc.name.replace(/branch|office/i, '').trim()}:</span>
                              <span>{q}</span>
                            </span>
                          {/each}
                        </div>
                      </div>

                      <div class="shrink-0 text-right">
                        <div class="font-mono text-xs font-bold text-fg">
                          {fmtMoney(v.selling_price || 0)}
                        </div>
                        <div class="mt-0.5 font-mono text-[11px] font-semibold {st > 0 ? 'text-ok' : 'text-bad'}">
                          {st > 0 ? `${st} in stock` : '0 in branch'}
                        </div>
                      </div>
                    </button>
                    {#if st <= 0}
                      <button
                        type="button"
                        class="btn btn-sm h-7 shrink-0 px-2 text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                        onclick={(e) => {
                          e.stopPropagation();
                          quickAddStockToBranchAndBill(v, 1);
                          resetSearch();
                        }}
                        title="Add +1 stock to this branch and add to bill"
                      >
                        <Plus class="h-3 w-3" />
                        <span>+1 Stock &amp; Bill</span>
                      </button>
                    {/if}
                  </li>
                {:else}
                  <li class="p-5 text-center space-y-2.5">
                    <p class="text-xs text-muted">No catalog item found for "{debounced}"</p>
                    <button
                      type="button"
                      class="btn btn-sm h-9 px-3.5 bg-amber-600 text-white hover:bg-amber-700 border-amber-600 font-semibold"
                      onclick={() => {
                        const { baseSku, size } = extractBaseSkuAndSize(debounced.trim());
                        openEmergencyQuickAdd(baseSku || debounced.trim(), size || '');
                        qaBarcode = debounced.trim();
                        resetSearch();
                      }}
                    >
                      <AlertCircle class="h-3.5 w-3.5" />
                      <span>Emergency Quick Add "{debounced.trim()}"</span>
                    </button>
                  </li>
                {/each}
              </ul>
              {#if results.length > 0}
                <div class="flex items-center justify-between border-t border-line bg-raised/50 px-3 py-2">
                  <span class="text-[11px] text-muted">Item or size not in list?</span>
                  <button
                    type="button"
                    class="btn btn-sm h-7 px-2.5 text-[11px] border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                    onclick={() => {
                      const { baseSku, size } = extractBaseSkuAndSize(debounced.trim());
                      openEmergencyQuickAdd(baseSku || debounced.trim(), size || '');
                      resetSearch();
                    }}
                  >
                    <PackagePlus class="h-3 w-3" />
                    <span>Emergency Quick Add</span>
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Active Model 1-Tap Size Selector Bar -->
        {#if activeModelSiblings.length >= 1}
          {@const modelProd = activeModelSiblings[0].products}
          <div class="rounded-xl border border-line bg-raised/40 p-2.5">
            <div class="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-dim">
              <span>
                1-Tap Add Size: <strong class="text-fg">{modelProd?.name || activeModelSiblings[0].sku}</strong>
              </span>
              <button
                type="button"
                class="cursor-pointer text-[10px] text-dim hover:text-fg"
                onclick={() => (activeModelProductId = null)}
              >
                Hide
              </button>
            </div>
            <div class="flex flex-wrap gap-1.5">
              {#each activeModelSiblings as sib (sib.id)}
                {@const st = app.getStock(sib.id, locationId)}
                {@const inBillQty = lines.find((l) => l.variant.id === sib.id)?.qty || 0}
                <button
                  type="button"
                  class="min-w-[52px] cursor-pointer rounded-lg border px-2 py-1 text-center transition
                    {inBillQty > 0
                      ? 'border-fg bg-fg text-bg shadow-xs'
                      : st > 0
                        ? 'border-line bg-surface text-fg hover:border-fg/40'
                        : 'border-bad/25 bg-bad/5 text-muted hover:border-fg/30'}"
                  onclick={() => addVariantToBill(sib, 1)}
                  title="Tap to add +1 pair of Size {getShoeDisplaySize(sib.size, sib.products)}"
                >
                  <span class="block text-xs font-bold">
                    Sz {getShoeDisplaySize(sib.size, sib.products)}
                  </span>
                  <span class="block font-mono text-[10px] {inBillQty > 0 ? 'text-bg/90 font-bold' : st > 0 ? 'text-ok' : 'text-bad'}">
                    {inBillQty > 0 ? `In Bill: ${inBillQty}` : `${st} prs`}
                  </span>
                </button>
              {/each}
              {#if activeModelProductId}
                <button
                  type="button"
                  class="min-w-[58px] cursor-pointer rounded-lg border border-dashed border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-center text-amber-600 dark:text-amber-400 transition hover:bg-amber-500/20"
                  onclick={() => openQuickAddSizeForModel(activeModelProductId!)}
                  title="Add a missing size for this model and add to bill"
                >
                  <span class="block text-xs font-bold">+ Size</span>
                  <span class="block text-[9px] font-semibold">Quick Add</span>
                </button>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- CURRENT BILL ITEMS CARD -->
      <div class="card overflow-hidden">
        <div class="flex items-center justify-between border-b border-line bg-raised/40 px-4 py-3">
          <div class="flex items-center gap-2">
            <Receipt class="h-4 w-4 text-muted" />
            <h2 class="text-xs font-bold uppercase tracking-wider text-fg">
              Current Bill Items ({lines.length} Styles · {totalPairs} Pairs)
            </h2>
          </div>
          {#if lines.length > 0}
            <button
              type="button"
              class="btn btn-ghost btn-sm h-7 px-2 text-xs text-dim hover:text-bad"
              onclick={clearBill}
            >
              <Trash2 class="h-3.5 w-3.5" />
              <span>Clear Bill</span>
            </button>
          {/if}
        </div>

        {#if lines.length === 0}
          <div class="p-10 text-center">
            <ShoppingBag class="mx-auto mb-2 h-8 w-8 text-dim" />
            <p class="text-xs font-semibold text-fg">Bill Basket is Empty</p>
            <p class="mt-1 text-[11px] text-dim">
              Scan a shoe barcode with your phone camera or search above to start billing.
            </p>
          </div>
        {:else}
          <div class="divide-y divide-line">
            {#each lines as line, idx (line.variant.id)}
              {@const v = line.variant}
              {@const lineNet = Math.max(0, line.unitPrice - (line.itemDiscount || 0)) * line.qty}
              <div class="flex flex-col gap-2.5 p-3.5 sm:flex-row sm:items-center sm:justify-between hover:bg-raised/20">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="font-display text-xs font-bold text-fg sm:text-sm">
                      {v.products?.brand ? `${v.products.brand} · ` : ''}{v.products?.name || v.sku}
                    </span>
                    <span class="chip py-0 text-[10px] font-bold text-fg">
                      Sz {getShoeDisplaySize(v.size, v.products)}
                    </span>
                    {#if v.colour}
                      <span class="text-[11px] text-muted">· {v.colour}</span>
                    {/if}
                  </div>
                  <div class="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-dim">
                    <span>SKU: {v.sku}</span>
                    <span>·</span>
                    <span class={line.availableStock > 0 ? 'text-ok' : 'text-warn'}>
                      Branch Stock: {line.availableStock}
                    </span>
                  </div>
                </div>

                <!-- Price, Qty Stepper & Line Total -->
                <div class="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                  <!-- Editable Unit Price (syncs with DB like Desktop POS) -->
                  <div class="flex items-center gap-1">
                    <span class="text-[10px] text-dim">Rs.</span>
                    <input
                      type="number"
                      class="input h-8 w-24 px-2 text-right font-mono text-xs font-semibold"
                      bind:value={line.unitPrice}
                      onchange={() => saveLinePriceToDb(v, Number(line.unitPrice) || 0)}
                      min="0"
                      title="Click to change selling price (updates catalog price)"
                    />
                  </div>

                  <!-- Qty Stepper -->
                  <div class="flex items-center rounded-lg border border-line bg-surface">
                    <button
                      type="button"
                      class="grid h-8 w-8 cursor-pointer place-items-center text-muted hover:bg-raised hover:text-fg"
                      onclick={() => changeLineQty(idx, -1)}
                      aria-label="Decrease quantity"
                    >
                      <Minus class="h-3 w-3" />
                    </button>
                    <span class="w-8 text-center font-mono text-xs font-bold text-fg">{line.qty}</span>
                    <button
                      type="button"
                      class="grid h-8 w-8 cursor-pointer place-items-center text-muted hover:bg-raised hover:text-fg"
                      onclick={() => changeLineQty(idx, 1)}
                      aria-label="Increase quantity"
                    >
                      <Plus class="h-3 w-3" />
                    </button>
                  </div>

                  <!-- Line Total -->
                  <div class="min-w-[82px] text-right font-mono text-xs font-bold text-fg">
                    {fmtMoney(lineNet)}
                  </div>

                  <!-- Remove Button -->
                  <button
                    type="button"
                    class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-dim hover:bg-bad/10 hover:text-bad"
                    onclick={() => removeLine(idx)}
                    aria-label="Remove item"
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

    <!-- RIGHT COLUMN: Customer & Settlement Checkout Card (5 cols) -->
    <div
      bind:this={billSection}
      class="min-w-0 space-y-3.5 lg:col-span-5 lg:sticky lg:top-18"
    >
      <!-- Customer & WhatsApp Phone Card -->
      <div class="card p-3.5 space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <User class="h-3.5 w-3.5 text-dim" />
            <span>Customer / WhatsApp Receipt No (Optional)</span>
          </span>
          <button
            type="button"
            class="cursor-pointer text-[11px] font-semibold text-ok hover:underline"
            onclick={() => (newCustOpen = !newCustOpen)}
          >
            {newCustOpen ? 'Cancel' : '+ New Customer'}
          </button>
        </div>

        {#if customer}
          <div class="flex items-center justify-between rounded-lg border border-ok/30 bg-ok/5 px-3 py-2 text-xs">
            <div>
              <div class="font-bold text-fg">{customer.name}</div>
              <div class="font-mono text-[11px] text-muted">{customer.phone}</div>
            </div>
            <button
              type="button"
              class="btn btn-ghost btn-sm h-7 w-7 p-0"
              onclick={() => (customer = null)}
              aria-label="Remove customer"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
        {:else if newCustOpen}
          <div class="rounded-lg border border-line bg-raised/50 p-2.5 space-y-2">
            <div class="grid grid-cols-2 gap-2">
              <input
                type="text"
                class="input h-8 text-xs"
                placeholder="Customer Name *"
                bind:value={newCustName}
              />
              <input
                type="tel"
                class="input h-8 text-xs font-mono"
                placeholder="Phone (077...)"
                bind:value={newCustPhone}
              />
            </div>
            <button
              type="button"
              class="btn btn-primary btn-sm w-full h-8 text-xs"
              onclick={saveNewCustomer}
              disabled={custBusy}
            >
              <span>{custBusy ? 'Saving...' : 'Save & Attach Customer'}</span>
            </button>
          </div>
        {:else}
          <div class="relative">
            <Phone class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
            <input
              type="text"
              class="input h-9 pl-8 text-xs"
              placeholder="Customer Phone for WhatsApp Bill (e.g. 0771234567) or Name..."
              bind:value={custQuery}
              oninput={onCustSearchInput}
            />
            {#if custResults.length > 0}
              <div class="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-xl">
                {#each custResults as c (c.id)}
                  <button
                    type="button"
                    class="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-xs hover:bg-raised"
                    onclick={() => {
                      customer = c;
                      whatsappPhone = c.phone || '';
                      custResults = [];
                      custQuery = '';
                    }}
                  >
                    <span class="font-semibold text-fg">{c.name}</span>
                    <span class="font-mono text-muted">{c.phone}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Settlement Summary Card -->
      <div class="card p-4 space-y-4">
        <div class="flex items-center justify-between border-b border-line pb-2.5">
          <h2 class="text-xs font-bold uppercase tracking-wider text-fg">
            Settlement Summary (ගෙවීම් විස්තරය)
          </h2>
          <span class="chip font-mono text-[11px]">{totalPairs} Pairs</span>
        </div>

        <!-- Subtotal -->
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted font-medium">Subtotal (මුළු එකතුව)</span>
          <strong class="font-mono text-sm text-fg">{fmtMoney(subtotal)}</strong>
        </div>

        <!-- Discount Row -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted">Discount (වට්ටම)</span>
            <div class="flex items-center gap-1 rounded-md border border-line bg-surface p-0.5">
              <button
                type="button"
                class="cursor-pointer rounded px-2 py-0.5 text-[10px] font-bold transition {discountMode === 'fixed' ? 'bg-fg text-bg' : 'text-muted'}"
                onclick={() => (discountMode = 'fixed')}
              >
                Rs.
              </button>
              <button
                type="button"
                class="cursor-pointer rounded px-2 py-0.5 text-[10px] font-bold transition {discountMode === 'pct' ? 'bg-fg text-bg' : 'text-muted'}"
                onclick={() => (discountMode = 'pct')}
              >
                %
              </button>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <input
              type="number"
              class="input h-9 flex-1 font-mono text-xs"
              placeholder={discountMode === 'pct' ? 'Discount % (e.g. 10)' : 'Discount Rs. (e.g. 200)'}
              bind:value={discountVal}
              min="0"
            />
            <!-- Quick Discount Pills -->
            {#each [5, 10] as pct}
              <button
                type="button"
                class="btn btn-sm h-9 px-2 font-mono text-[11px]"
                onclick={() => {
                  discountMode = 'pct';
                  discountVal = String(pct);
                }}
              >
                {pct}%
              </button>
            {/each}
            <button
              type="button"
              class="btn btn-sm h-9 px-2 font-mono text-[11px]"
              onclick={() => {
                discountMode = 'fixed';
                discountVal = '200';
              }}
            >
              -200
            </button>
          </div>
          {#if discountAmount > 0}
            <div class="text-right font-mono text-[11px] text-warn">
              Discount Applied: - {fmtMoney(discountAmount)}
            </div>
          {/if}
        </div>

        <!-- GRAND TOTAL BANNER -->
        <div class="rounded-xl border border-fg/20 bg-raised p-3.5 flex items-center justify-between">
          <div>
            <div class="text-[10px] font-bold uppercase tracking-wider text-muted">
              GRAND TOTAL (ගෙවිය යුතු මුදල)
            </div>
            <div class="font-display text-2xl font-black tracking-tight text-fg sm:text-3xl">
              {fmtMoney(grandTotal)}
            </div>
          </div>
        </div>

        <!-- Payment Method Selector -->
        <div class="space-y-1.5">
          <div class="label">Payment Method (ගෙවීම් ක්‍රමය)</div>
          <div class="grid grid-cols-4 gap-1.5">
            {#each [
              { id: 'cash', label: 'Cash', icon: Banknote },
              { id: 'card', label: 'Card', icon: CreditCard },
              { id: 'split', label: 'Split', icon: Split },
              { id: 'qr', label: 'QR/Bank', icon: QrCode },
            ] as pm}
              {@const Icon = pm.icon}
              {@const active = paymentMethod === pm.id}
              <button
                type="button"
                class="flex cursor-pointer flex-col items-center gap-1 rounded-lg border py-2 text-xs font-semibold transition
                  {active ? 'border-fg bg-fg text-bg shadow-xs' : 'border-line bg-surface text-muted hover:text-fg'}"
                onclick={() => (paymentMethod = pm.id as PaymentMethod)}
              >
                <Icon class="h-4 w-4" />
                <span>{pm.label}</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- Cash Tendered & Change Calculator -->
        {#if paymentMethod === 'cash' || paymentMethod === 'split'}
          <div class="rounded-xl border border-line bg-surface p-3 space-y-2">
            <div class="flex items-center justify-between">
              <label for="pos-cash-received" class="text-xs font-semibold text-muted">
                Cash Received (ලැබුණු මුදල)
              </label>
              <div class="flex gap-1">
                {#each [grandTotal, 1000, 2000, 5000] as amt}
                  {#if amt > 0}
                    <button
                      type="button"
                      class="cursor-pointer rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] font-semibold text-fg hover:border-fg/40"
                      onclick={() => (cashReceived = String(amt))}
                    >
                      {amt === grandTotal ? 'Exact' : amt}
                    </button>
                  {/if}
                {/each}
              </div>
            </div>

            <input
              id="pos-cash-received"
              type="number"
              class="input h-10 font-mono text-base font-bold"
              placeholder="0.00"
              bind:value={cashReceived}
              min="0"
            />

            {#if cashReceivedNum > 0}
              <div class="flex items-center justify-between border-t border-line pt-2">
                <span class="text-xs font-semibold text-muted">
                  {paymentMethod === 'split' ? 'Balance on Card:' : 'Change to Give (ඉතිරි මුදල):'}
                </span>
                <span class="font-mono text-base font-black text-ok">
                  {fmtMoney(paymentMethod === 'split' ? splitCardBalance : changeAmount)}
                </span>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Counter PC Printer Auto-Print Toggle -->
        <label
          class="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3 select-none"
        >
          <div class="flex items-center gap-2 min-w-0">
            <div class="relative shrink-0">
              <Printer class="h-4 w-4 {autoPcPrint ? 'text-ok' : 'text-dim'}" />
              {#if counterPcOnline === true}
                <span class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-surface animate-pulse" title="Counter PC Online"></span>
              {:else if counterPcOnline === false}
                <span class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-surface" title="Counter PC Offline"></span>
              {/if}
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-bold text-fg">
                  Auto-Print on Counter PC ({activeLoc?.name || 'Branch'})
                </span>
                {#if counterPcOnline === true}
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    PC Online
                  </span>
                {:else if counterPcOnline === false}
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    <span class="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                    PC Offline
                  </span>
                {/if}
              </div>
              <div class="text-[10px] text-muted">
                {#if counterPcOnline === false}
                  කවුන්ටර් PC එකේ POS App එක Open කරලා තියෙන්න ඕනේ
                {:else}
                  PC POS එක ON නම් USB Printer එකෙන් ස්වයංක්‍රීයව බිල Print වේ
                {/if}
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            class="h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
            checked={autoPcPrint}
            onchange={(e) => {
              autoPcPrint = (e.currentTarget as HTMLInputElement).checked;
              saveAutoPcPrint(autoPcPrint);
            }}
          />
        </label>

        <!-- Checkout Action Buttons -->
        <div class="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
          <button
            type="button"
            class="btn btn-primary h-12 text-sm font-bold shadow-md"
            onclick={() => completeSale(false)}
            disabled={busy || lines.length === 0}
          >
            {#if busy}
              <Loader2 class="h-4 w-4 animate-spin" />
              <span>Processing...</span>
            {:else}
              <MessageCircle class="h-4 w-4" />
              <span>Complete &amp; Receipt (බිල දාන්න)</span>
            {/if}
          </button>

          <button
            type="button"
            class="btn h-12 text-sm font-bold border-fg/30"
            onclick={() => completeSale(true)}
            disabled={busy || lines.length === 0}
          >
            <Printer class="h-4 w-4 text-ok" />
            <span>Print on PC &amp; Pay</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- RECENT POS BILLS / SALES REGISTER (MOBILE-FIRST DETAIL & COMPACT VIEWS) -->
  <div class="card overflow-hidden">
    <!-- Header & View Mode Toggle -->
    <div class="border-b border-line bg-raised/40 p-3 sm:px-4 sm:py-3 space-y-2.5 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-2">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h2 class="text-xs font-bold uppercase tracking-wider text-fg truncate">
            Recent POS Bills ({activeLoc?.name || 'Branch'})
          </h2>
          <p class="text-[11px] text-dim">
            බිල්පත් වල අලෙවි වූ සපත්තු (SKU, Size, Colour, Price) සවිස්තරාත්මකව
          </p>
        </div>
        <button
          type="button"
          class="btn btn-sm h-8 shrink-0 sm:hidden px-2.5"
          onclick={() => fetchRecentSales(locationId)}
          disabled={loadingSales}
        >
          <RefreshCw class="h-3.5 w-3.5 {loadingSales ? 'animate-spin' : ''}" />
          <span>Refresh</span>
        </button>
      </div>

      <div class="flex items-center gap-1.5">
        <!-- View Mode Toggle (Full width 2-col on mobile) -->
        <div class="grid flex-1 grid-cols-2 rounded-lg border border-line bg-surface p-0.5 sm:inline-flex sm:flex-initial">
          <button
            type="button"
            class="cursor-pointer rounded-md px-2.5 py-1.5 sm:py-1 text-[11px] font-bold transition text-center
              {recentViewMode === 'detailed' ? 'bg-fg text-bg shadow-xs' : 'text-muted hover:text-fg'}"
            onclick={() => (recentViewMode = 'detailed')}
          >
            Detailed (සවිස්තරව)
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-md px-2.5 py-1.5 sm:py-1 text-[11px] font-bold transition text-center
              {recentViewMode === 'compact' ? 'bg-fg text-bg shadow-xs' : 'text-muted hover:text-fg'}"
            onclick={() => (recentViewMode = 'compact')}
          >
            Compact (කෙටියෙන්)
          </button>
        </div>

        <button
          type="button"
          class="btn btn-sm hidden h-8 sm:inline-flex"
          onclick={() => fetchRecentSales(locationId)}
          disabled={loadingSales}
        >
          <RefreshCw class="h-3.5 w-3.5 {loadingSales ? 'animate-spin' : ''}" />
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <!-- Filter Bar (Date, Payment Method, Search, Summary KPIs) -->
    <div class="border-b border-line bg-surface/60 p-3 sm:px-4 sm:py-2.5 space-y-2">
      <div class="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <!-- Date Filter Pills (4-col grid on mobile) -->
        <div class="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap">
          {#each [
            { id: 'all', label: 'All (50)' },
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: '7days', label: '7 Days' },
          ] as df}
            <button
              type="button"
              class="cursor-pointer rounded-md border px-1.5 py-1.5 sm:px-2.5 sm:py-1 text-[11px] font-semibold transition text-center truncate
                {recentDateFilter === df.id
                  ? 'border-fg bg-fg text-bg'
                  : 'border-line bg-raised text-muted hover:text-fg'}"
              onclick={() => (recentDateFilter = df.id as any)}
            >
              {df.label}
            </button>
          {/each}
        </div>

        <!-- Payment Filter Pills (3-col grid on mobile) -->
        <div class="grid grid-cols-3 gap-1 sm:flex sm:items-center">
          {#each [
            { id: 'all', label: 'All Pay' },
            { id: 'cash', label: 'Cash' },
            { id: 'card', label: 'Card' },
          ] as pf}
            <button
              type="button"
              class="cursor-pointer rounded-md border px-2 py-1 text-[11px] font-semibold transition text-center
                {recentPaymentFilter === pf.id
                  ? 'border-fg bg-fg text-bg'
                  : 'border-line bg-raised text-muted hover:text-fg'}"
              onclick={() => (recentPaymentFilter = pf.id as any)}
            >
              {pf.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Search Input + Filtered Totals Strip -->
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="relative w-full sm:max-w-md">
          <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
          <input
            type="text"
            class="input h-9 sm:h-8 pl-8 pr-7 text-xs w-full"
            placeholder="Search Invoice No, SKU, Brand, Size..."
            bind:value={recentSearch}
          />
          {#if recentSearch}
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-dim hover:text-fg"
              onclick={() => (recentSearch = '')}
            >
              <X class="h-3.5 w-3.5" />
            </button>
          {/if}
        </div>

        <!-- Mobile-Responsive KPI Summary Grid -->
        <div class="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center text-[11px] font-mono">
          <div class="rounded-md border border-line bg-raised px-2.5 py-1 flex items-center justify-between sm: gap-1.5">
            <span class="text-muted">Bills / Pairs:</span>
            <strong class="text-fg">{filteredSalesStats.activeBills} ({filteredSalesStats.totalPairsSold} prs)</strong>
          </div>
          <div class="rounded-md border border-line bg-raised px-2.5 py-1 flex items-center justify-between sm:gap-1.5">
            <span class="text-muted">Cash:</span>
            <strong class="text-ok">{fmtMoney(filteredSalesStats.cashRev)}</strong>
          </div>
          <div class="rounded-md border border-line bg-raised px-2.5 py-1 flex items-center justify-between sm:gap-1.5">
            <span class="text-muted">Card:</span>
            <strong class="text-fg">{fmtMoney(filteredSalesStats.cardRev)}</strong>
          </div>
          <div class="rounded-md border border-fg/30 bg-raised px-2.5 py-1 flex items-center justify-between sm:gap-1.5 font-bold text-fg">
            <span>Total:</span>
            <span>{fmtMoney(filteredSalesStats.totalRevenue)}</span>
          </div>
        </div>
      </div>
    </div>

    {#if filteredRecentSales.length === 0}
      <div class="p-8 text-center text-xs text-muted">
        {loadingSales
          ? 'Loading recent branch bills...'
          : 'No matching POS bills found for the selected filter.'}
      </div>
    {:else if recentViewMode === 'detailed'}
      <!-- DETAILED BILL-BY-BILL CARDS VIEW -->
      <div class="divide-y divide-line">
        {#each filteredRecentSales as s (s.id)}
          {@const isCancelled = s.status === 'cancelled'}
          {@const items = resolveSaleItems(s)}
          {@const itemCount = items.reduce((n: number, i: any) => n + i.qty, 0)}
          {@const cust = resolveSaleCustomer(s)}
          {@const cashierName = resolveCashierName(s)}
          {@const saleTotal = Number(s.total) || 0}
          {@const saleDisc = Number(s.discount) || 0}
          <div class="p-3 sm:p-4 hover:bg-raised/20 transition space-y-2.5 {isCancelled ? 'opacity-55' : ''}">
            <!-- Bill Header Row (Clean 2-side layout on Mobile & Desktop) -->
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 space-y-1">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="rounded-md bg-fg px-2 py-0.5 font-mono text-xs font-bold text-bg">
                    {formatInvoiceNo(s.invoice_no, s.id)}
                  </span>
                  <span class="chip py-0 px-1.5 text-[10px] uppercase font-mono font-bold">
                    {s.payment_method || 'cash'}
                  </span>
                  {#if isCancelled}
                    <span class="chip border-bad/40 bg-bad/15 text-bad text-[10px] font-bold py-0">
                      CANCELLED
                    </span>
                  {/if}
                </div>
                <div class="text-[11px] text-muted">
                  {new Date(s.created_at).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  <span class="mx-1">·</span>
                  <span>Cashier: <strong class="text-fg">{cashierName}</strong></span>
                </div>
                {#if cust}
                  <div class="text-[11px] text-fg font-medium">
                    Customer: {cust.name}{cust.phone ? ` (${cust.phone})` : ''}
                  </div>
                {/if}
              </div>

              <!-- Right Grand Total -->
              <div class="text-right shrink-0">
                <div class="font-mono text-sm sm:text-base font-black text-fg">
                  {fmtMoney(saleTotal)}
                </div>
                <div class="text-[11px] text-muted font-mono">
                  {itemCount} pair{itemCount === 1 ? '' : 's'}
                </div>
                {#if saleDisc > 0}
                  <div class="font-mono text-[10px] text-warn">
                    Disc: -{fmtMoney(saleDisc)}
                  </div>
                {/if}
              </div>
            </div>

            <!-- MOBILE STACKED ITEMS LIST (<sm: zero horizontal scroll!) -->
            <div class="rounded-xl border border-line bg-surface divide-y divide-line sm:hidden">
              {#each items as it, idx}
                <div class="p-2.5 space-y-1">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 text-xs font-bold text-fg leading-snug">
                      <span class="font-mono text-dim mr-1">{idx + 1}.</span>
                      {#if it.brand}
                        <span class="text-muted font-semibold">{it.brand} · </span>
                      {/if}
                      <span>{it.name}</span>
                    </div>
                    <div class="font-mono text-xs font-black text-fg shrink-0">
                      Rs. {it.lineTotal.toLocaleString()}
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
                    <div class="flex flex-wrap items-center gap-1">
                      <span class="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] font-semibold text-fg">
                        {it.sku}
                      </span>
                      <span class="rounded bg-fg/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-fg">
                        Sz {it.displaySize}
                      </span>
                      {#if it.colour}
                        <span class="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-muted">
                          {it.colour}
                        </span>
                      {/if}
                    </div>
                    <div class="font-mono text-[11px] text-muted">
                      {it.qty} × Rs. {it.unitPrice.toLocaleString()}
                    </div>
                  </div>
                </div>
              {/each}
            </div>

            <!-- DESKTOP TABLE (sm+: wide screen table) -->
            <div class="hidden sm:block overflow-x-auto rounded-lg border border-line bg-surface">
              <table class="w-full text-xs">
                <thead class="bg-raised/70 border-b border-line text-[10px] uppercase text-dim">
                  <tr>
                    <th class="py-1.5 pl-3 text-left font-semibold">#</th>
                    <th class="py-1.5 text-left font-semibold">Shoe Model / Brand</th>
                    <th class="py-1.5 text-left font-semibold">SKU / Code</th>
                    <th class="py-1.5 text-center font-semibold">Size</th>
                    <th class="py-1.5 text-center font-semibold">Colour</th>
                    <th class="py-1.5 text-center font-semibold">Qty</th>
                    <th class="py-1.5 text-right font-semibold">Unit Price</th>
                    <th class="py-1.5 pr-3 text-right font-semibold">Line Total</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-line/60">
                  {#each items as it, idx}
                    <tr class="hover:bg-raised/30">
                      <td class="py-1.5 pl-3 font-mono text-[11px] text-dim">{idx + 1}</td>
                      <td class="py-1.5 font-semibold text-fg">
                        {#if it.brand}
                          <span class="text-muted font-normal">{it.brand} · </span>
                        {/if}
                        {it.name}
                      </td>
                      <td class="py-1.5 font-mono text-[11px] font-semibold text-fg">{it.sku}</td>
                      <td class="py-1.5 text-center">
                        <span class="chip py-0 px-1.5 font-mono text-[11px] font-bold text-fg">
                          Sz {it.displaySize}
                        </span>
                      </td>
                      <td class="py-1.5 text-center font-mono text-[11px] text-muted">
                        {it.colour || '-'}
                      </td>
                      <td class="py-1.5 text-center font-mono font-bold text-fg">{it.qty}</td>
                      <td class="py-1.5 text-right font-mono text-muted">
                        Rs. {it.unitPrice.toLocaleString()}
                      </td>
                      <td class="py-1.5 pr-3 text-right font-mono font-bold text-fg">
                        Rs. {it.lineTotal.toLocaleString()}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <!-- Action Buttons Row (Full-width touch bar on mobile, right-aligned on desktop) -->
            <div class="flex items-center gap-1.5 pt-0.5 sm:justify-end">
              {#if !isCancelled}
                <button
                  type="button"
                  class="btn btn-sm h-8 flex-1 sm:flex-initial px-2.5 text-[11px] font-semibold"
                  onclick={() => reprintPastSaleOnPc(s)}
                  disabled={sendingPcSaleId === s.id}
                  title="Print on Counter PC Thermal Printer"
                >
                  {#if sendingPcSaleId === s.id}
                    <Loader2 class="h-3.5 w-3.5 animate-spin" />
                  {:else}
                    <Printer class="h-3.5 w-3.5 text-ok" />
                  {/if}
                  <span>PC Print</span>
                </button>
              {/if}
              <button
                type="button"
                class="btn btn-sm h-8 flex-1 sm:flex-initial px-2.5 text-[11px] font-semibold"
                onclick={() => openPastSaleReceipt(s)}
              >
                <Receipt class="h-3.5 w-3.5 text-ok" />
                <span>Receipt / WhatsApp</span>
              </button>
              {#if !isCancelled}
                <button
                  type="button"
                  class="btn btn-ghost btn-sm h-8 px-2.5 text-[11px] text-dim hover:text-bad shrink-0"
                  onclick={() => voidSale(s)}
                  disabled={voidingSaleId === s.id}
                  title="Cancel bill and restore stock"
                >
                  <Ban class="h-3.5 w-3.5" />
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- COMPACT VIEW: Mobile Expandable Cards (<sm) + Desktop Table (sm+) -->
      <div class="divide-y divide-line sm:hidden">
        {#each filteredRecentSales as s (s.id)}
          {@const isCancelled = s.status === 'cancelled'}
          {@const items = resolveSaleItems(s)}
          {@const itemCount = items.reduce((n: number, i: any) => n + i.qty, 0)}
          {@const isExpanded = Boolean(expandedSaleIds[s.id])}
          <div class="p-3 {isCancelled ? 'opacity-55' : ''}">
            <button
              type="button"
              class="flex w-full cursor-pointer items-center justify-between gap-2 text-left"
              onclick={() => toggleExpandSale(s.id)}
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <ChevronDown
                    class="h-3.5 w-3.5 shrink-0 text-muted transition-transform {isExpanded ? 'rotate-180 text-fg' : ''}"
                  />
                  <span class="font-mono text-xs font-bold text-fg">{formatInvoiceNo(s.invoice_no, s.id)}</span>
                  <span class="chip py-0 px-1.5 text-[9px] uppercase font-mono">{s.payment_method || 'cash'}</span>
                  {#if isCancelled}
                    <span class="chip border-bad/30 bg-bad/10 text-bad text-[9px] py-0">CANCELLED</span>
                  {/if}
                </div>
                <div class="mt-0.5 truncate pl-5 text-[11px] text-muted">
                  {new Date(s.created_at).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  · {itemCount} pair{itemCount === 1 ? '' : 's'}
                  {#if items.length > 0}
                    ({items.map((i: any) => `${i.sku} Sz ${i.displaySize}`).join(', ')})
                  {/if}
                </div>
              </div>
              <div class="shrink-0 text-right font-mono text-xs font-black text-fg">
                {fmtMoney(Number(s.total) || 0)}
              </div>
            </button>

            {#if isExpanded}
              <div class="mt-2.5 space-y-2 border-t border-line pt-2.5">
                <div class="rounded-lg border border-line bg-surface divide-y divide-line">
                  {#each items as it, idx}
                    <div class="p-2 text-xs">
                      <div class="flex items-start justify-between gap-2">
                        <span class="font-semibold text-fg">
                          {idx + 1}. {it.brand ? `${it.brand} · ` : ''}{it.name}
                        </span>
                        <span class="font-mono font-bold text-fg shrink-0">Rs. {it.lineTotal.toLocaleString()}</span>
                      </div>
                      <div class="mt-1 flex items-center justify-between text-[11px] font-mono text-muted">
                        <span>{it.sku} · <strong class="text-fg">Sz {it.displaySize}</strong>{it.colour ? ` · ${it.colour}` : ''}</span>
                        <span>{it.qty} × Rs. {it.unitPrice.toLocaleString()}</span>
                      </div>
                    </div>
                  {/each}
                </div>
                <div class="flex items-center gap-1.5">
                  {#if !isCancelled}
                    <button
                      type="button"
                      class="btn btn-sm h-8 flex-1 text-[11px]"
                      onclick={() => reprintPastSaleOnPc(s)}
                      disabled={sendingPcSaleId === s.id}
                    >
                      <Printer class="h-3.5 w-3.5 text-ok" />
                      <span>PC Print</span>
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="btn btn-sm h-8 flex-1 text-[11px]"
                    onclick={() => openPastSaleReceipt(s)}
                  >
                    <Receipt class="h-3.5 w-3.5 text-ok" />
                    <span>Receipt</span>
                  </button>
                  {#if !isCancelled}
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm h-8 px-2.5 text-dim hover:text-bad"
                      onclick={() => voidSale(s)}
                      disabled={voidingSaleId === s.id}
                    >
                      <Ban class="h-3.5 w-3.5" />
                    </button>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- DESKTOP COMPACT TABLE VIEW (sm+) -->
      <div class="hidden sm:block overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="bg-raised border-b border-line">
            <tr>
              <th class="th py-2.5 pl-4">Invoice</th>
              <th class="th py-2.5">Date &amp; Time</th>
              <th class="th py-2.5">Items Summary</th>
              <th class="th py-2.5 text-center">Payment</th>
              <th class="th py-2.5 text-right">Total</th>
              <th class="th py-2.5 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            {#each filteredRecentSales as s (s.id)}
              {@const isCancelled = s.status === 'cancelled'}
              {@const items = resolveSaleItems(s)}
              {@const itemCount = items.reduce((n: number, i: any) => n + i.qty, 0)}
              {@const isExpanded = Boolean(expandedSaleIds[s.id])}
              <tr
                class="cursor-pointer hover:bg-raised/30 {isCancelled ? 'opacity-50' : ''}"
                onclick={() => toggleExpandSale(s.id)}
              >
                <td class="td py-2.5 pl-4 font-mono font-bold text-fg">
                  <div class="inline-flex items-center gap-1.5">
                    <ChevronDown
                      class="h-3.5 w-3.5 text-muted transition-transform {isExpanded ? 'rotate-180 text-fg' : ''}"
                    />
                    <span>{formatInvoiceNo(s.invoice_no, s.id)}</span>
                    {#if isCancelled}
                      <span class="ml-1 chip border-bad/30 bg-bad/10 text-bad text-[9px] py-0">CANCELLED</span>
                    {/if}
                  </div>
                </td>
                <td class="td py-2.5 text-muted">
                  {new Date(s.created_at).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td class="td py-2.5 text-muted">
                  <span class="font-mono font-semibold text-fg">{itemCount} pair{itemCount === 1 ? '' : 's'}</span>
                  {#if items.length > 0}
                    <span class="ml-1.5 text-[11px] text-dim">
                      ({items.map((i: any) => `${i.sku} Sz ${i.displaySize}`).join(', ')})
                    </span>
                  {/if}
                </td>
                <td class="td py-2.5 text-center">
                  <span class="chip py-0 text-[10px] uppercase font-mono">{s.payment_method || 'cash'}</span>
                </td>
                <td class="td py-2.5 text-right font-mono font-bold text-fg">
                  {fmtMoney(Number(s.total) || 0)}
                </td>
                <td class="td py-2.5 pr-4 text-right" onclick={(e) => e.stopPropagation()}>
                  <div class="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      class="btn btn-sm h-7 px-2 text-[11px]"
                      onclick={() => toggleExpandSale(s.id)}
                    >
                      <span>{isExpanded ? 'Hide' : 'Details'}</span>
                    </button>
                    {#if !isCancelled}
                      <button
                        type="button"
                        class="btn btn-sm h-7 px-2 text-[11px]"
                        onclick={() => reprintPastSaleOnPc(s)}
                        disabled={sendingPcSaleId === s.id}
                        title="Print on Counter PC Thermal Printer"
                      >
                        {#if sendingPcSaleId === s.id}
                          <Loader2 class="h-3 w-3 animate-spin" />
                        {:else}
                          <Printer class="h-3 w-3 text-ok" />
                        {/if}
                        <span>PC Print</span>
                      </button>
                    {/if}
                    <button
                      type="button"
                      class="btn btn-sm h-7 px-2 text-[11px]"
                      onclick={() => openPastSaleReceipt(s)}
                    >
                      <Receipt class="h-3 w-3 text-ok" />
                      <span>Receipt</span>
                    </button>
                    {#if !isCancelled}
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm h-7 px-2 text-[11px] text-dim hover:text-bad"
                        onclick={() => voidSale(s)}
                        disabled={voidingSaleId === s.id}
                        title="Cancel bill and restore stock"
                      >
                        <Ban class="h-3 w-3" />
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
              {#if isExpanded}
                <tr class="bg-raised/40">
                  <td colspan="6" class="p-3">
                    <div class="overflow-x-auto rounded-lg border border-line bg-surface">
                      <table class="w-full text-xs">
                        <thead class="bg-raised border-b border-line text-[10px] uppercase text-dim">
                          <tr>
                            <th class="py-1.5 pl-3 text-left">#</th>
                            <th class="py-1.5 text-left">Shoe Model / Brand</th>
                            <th class="py-1.5 text-left">SKU</th>
                            <th class="py-1.5 text-center">Size</th>
                            <th class="py-1.5 text-center">Colour</th>
                            <th class="py-1.5 text-center">Qty</th>
                            <th class="py-1.5 text-right">Unit Price</th>
                            <th class="py-1.5 pr-3 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-line/60">
                          {#each items as it, idx}
                            <tr>
                              <td class="py-1.5 pl-3 font-mono text-dim">{idx + 1}</td>
                              <td class="py-1.5 font-semibold text-fg">
                                {it.brand ? `${it.brand} · ` : ''}{it.name}
                              </td>
                              <td class="py-1.5 font-mono text-fg">{it.sku}</td>
                              <td class="py-1.5 text-center font-mono font-bold text-fg">Sz {it.displaySize}</td>
                              <td class="py-1.5 text-center font-mono text-muted">{it.colour || '-'}</td>
                              <td class="py-1.5 text-center font-mono font-bold">{it.qty}</td>
                              <td class="py-1.5 text-right font-mono text-muted">Rs. {it.unitPrice.toLocaleString()}</td>
                              <td class="py-1.5 pr-3 text-right font-mono font-bold text-fg">
                                Rs. {it.lineTotal.toLocaleString()}
                              </td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<!-- Emergency Quick Add Modal (100% Desktop POS Parity + Mobile Responsive) -->
{#if quickAddOpen}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm">
    <div class="card flex max-h-[92vh] w-full max-w-[460px] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border-none shadow-2xl">
      <!-- Amber Header (Exact Desktop POS Styling) -->
      <div class="bg-amber-600 p-4 sm:p-5 text-white shrink-0">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-white/20 p-2 shrink-0">
              <AlertCircle class="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h3 class="font-display text-base sm:text-lg font-bold leading-tight text-white">
                {qaExistingProductId ? 'Quick Add Missing Size' : 'Emergency Quick Add'}
              </h3>
              <p class="mt-0.5 text-[11px] text-amber-100">
                {qaExistingProductId
                  ? `Adding new size variant to "${qaName}"`
                  : qaBarcode
                    ? `Barcode "${qaBarcode}" not found in system.`
                    : 'Add item not in branch / system directly to sale.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            class="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg bg-white/15 text-white hover:bg-white/25"
            onclick={() => (quickAddOpen = false)}
            aria-label="Close modal"
          >
            <X class="size-4" />
          </button>
        </div>
      </div>

      <!-- Scrollable Body -->
      <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
        <!-- Warning Alert Banner -->
        <div class="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">
          <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div class="space-y-0.5">
            <div class="text-[11px] font-bold uppercase tracking-wider">Important</div>
            <div class="text-[11px] opacity-90 leading-relaxed">
              Only use this to add items missing during checkout. For bulk stock arrivals, use the <strong>GRN</strong> tab.
            </div>
          </div>
        </div>

        {#if qaExistingProductId}
          <div class="flex items-center justify-between rounded-lg border border-line bg-raised px-3 py-2">
            <span class="text-[11px] text-muted">
              Linked to existing model: <strong class="text-fg">{qaName}</strong>
            </span>
            <button
              type="button"
              class="text-[11px] font-semibold text-amber-600 dark:text-amber-400 underline cursor-pointer"
              onclick={() => (qaExistingProductId = null)}
            >
              Create as New Product instead
            </button>
          </div>
        {/if}

        <!-- Product Name -->
        <div class="space-y-1.5">
          <label for="qa-name" class="text-[11px] font-bold uppercase tracking-wider text-muted">
            Product Name *
          </label>
          <input
            id="qa-name"
            type="text"
            class="input h-10 text-xs font-medium"
            placeholder="e.g. Nike Air Max or SFW099"
            bind:value={qaName}
            disabled={Boolean(qaExistingProductId)}
          />
        </div>

        <!-- Brand & Category (2 Columns on Desktop & Mobile) -->
        {#if !qaExistingProductId}
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <!-- Brand -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label for="qa-brand" class="text-[11px] font-bold uppercase tracking-wider text-muted">
                  Brand
                </label>
                <button
                  type="button"
                  class="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                  onclick={() => (addingBrandOpen = !addingBrandOpen)}
                >
                  {addingBrandOpen ? 'Cancel' : '+ New Brand'}
                </button>
              </div>
              {#if addingBrandOpen}
                <div class="flex gap-1.5">
                  <input
                    type="text"
                    class="input h-9 flex-1 text-xs"
                    placeholder="Brand name..."
                    bind:value={newBrandName}
                  />
                  <button
                    type="button"
                    class="btn btn-sm h-9 px-2.5 bg-amber-600 text-white border-amber-600"
                    onclick={createQuickBrand}
                  >
                    Add
                  </button>
                </div>
              {:else}
                <select id="qa-brand" class="input h-10 text-xs" bind:value={qaBrand}>
                  <option value="">Select Brand</option>
                  {#each allBrands as b (b)}
                    <option value={b}>{b}</option>
                  {/each}
                </select>
              {/if}
            </div>

            <!-- Category -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label for="qa-category" class="text-[11px] font-bold uppercase tracking-wider text-muted">
                  Category
                </label>
                <button
                  type="button"
                  class="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                  onclick={() => (addingCategoryOpen = !addingCategoryOpen)}
                >
                  {addingCategoryOpen ? 'Cancel' : '+ New Category'}
                </button>
              </div>
              {#if addingCategoryOpen}
                <div class="flex gap-1.5">
                  <input
                    type="text"
                    class="input h-9 flex-1 text-xs"
                    placeholder="Category name..."
                    bind:value={newCategoryName}
                  />
                  <button
                    type="button"
                    class="btn btn-sm h-9 px-2.5 bg-amber-600 text-white border-amber-600"
                    onclick={createQuickCategory}
                  >
                    Add
                  </button>
                </div>
              {:else}
                <select id="qa-category" class="input h-10 text-xs" bind:value={qaCategory}>
                  {#each allCategories as c (c)}
                    <option value={c}>{c}</option>
                  {/each}
                </select>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Size & Color (2 Columns) -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="qa-size" class="text-[11px] font-bold uppercase tracking-wider text-muted">
              Size
            </label>
            <input
              id="qa-size"
              type="text"
              class="input h-10 font-mono text-xs font-bold"
              placeholder="e.g. 42"
              bind:value={qaSize}
            />
          </div>
          <div class="space-y-1.5">
            <label for="qa-colour" class="text-[11px] font-bold uppercase tracking-wider text-muted">
              Color
            </label>
            <input
              id="qa-colour"
              type="text"
              class="input h-10 text-xs"
              placeholder="e.g. Black"
              bind:value={qaColour}
            />
          </div>
        </div>

        <!-- Cost, Price, Stock (3 Columns — Exact Desktop POS Layout) -->
        <div class="grid grid-cols-3 gap-2.5 sm:gap-3">
          <div class="space-y-1.5">
            <label for="qa-cost" class="text-[11px] font-bold uppercase tracking-wider text-muted">
              Cost (Rs.)
            </label>
            <input
              id="qa-cost"
              type="number"
              class="input h-10 font-mono text-xs"
              placeholder="0"
              bind:value={qaCost}
            />
          </div>
          <div class="space-y-1.5">
            <label for="qa-price" class="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Price (Rs.) *
            </label>
            <input
              id="qa-price"
              type="number"
              class="input h-10 border-amber-500/40 bg-amber-500/5 font-mono text-xs font-bold text-fg"
              placeholder="0"
              bind:value={qaPrice}
            />
          </div>
          <div class="space-y-1.5">
            <label for="qa-stock" class="text-[11px] font-bold uppercase tracking-wider text-muted">
              Stock
            </label>
            <input
              id="qa-stock"
              type="number"
              class="input h-10 text-center font-mono text-xs font-bold"
              bind:value={qaInitialStock}
              min="0"
            />
          </div>
        </div>

        <!-- Optional SKU & Barcode Override -->
        <div class="grid grid-cols-2 gap-3 pt-1 border-t border-line/60">
          <div class="space-y-1">
            <label for="qa-sku" class="text-[10px] font-semibold uppercase tracking-wider text-dim">
              SKU Code (Auto if blank)
            </label>
            <input
              id="qa-sku"
              type="text"
              class="input h-9 font-mono text-xs"
              placeholder="Auto-generated"
              bind:value={qaSku}
            />
          </div>
          <div class="space-y-1">
            <label for="qa-barcode" class="text-[10px] font-semibold uppercase tracking-wider text-dim">
              Barcode (Optional)
            </label>
            <input
              id="qa-barcode"
              type="text"
              class="input h-9 font-mono text-xs"
              placeholder="Scan or leave blank"
              bind:value={qaBarcode}
            />
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="flex gap-2.5 border-t border-line bg-surface p-4 shrink-0">
        <button
          type="button"
          class="btn flex-1 h-10 text-xs font-semibold"
          onclick={() => (quickAddOpen = false)}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn flex-[2] h-10 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white border-amber-600 shadow-md"
          onclick={submitQuickAdd}
          disabled={qaBusy}
        >
          {#if qaBusy}
            <Loader2 class="h-4 w-4 animate-spin" />
            <span>Adding...</span>
          {:else}
            <Plus class="h-4 w-4" />
            <span>Add to Sale</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if activeReceipt}
  <ReceiptModal
    receipt={activeReceipt}
    success={receiptIsSuccess}
    onclose={() => (activeReceipt = null)}
  />
{/if}

{#if cameraOpen}
  <CameraScanner onscan={handleBarcodeScan} onclose={() => (cameraOpen = false)} />
{/if}
