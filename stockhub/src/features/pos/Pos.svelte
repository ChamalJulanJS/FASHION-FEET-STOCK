<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    ShoppingBag, Store, ChevronDown, Check, Search, X, Camera, Zap, Plus, Minus,
    Trash2, Printer, MessageCircle, CreditCard, Banknote, QrCode, Split, User,
    Phone, RefreshCw, Receipt, Ban, Loader2, Sparkles, PackagePlus, Layers,
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
  } from './logic';

  // ---------------- state ----------------
  let locationId = $state('');
  let locDropdownOpen = $state(false);
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

  // Quick Add Unlisted Product modal
  let quickAddOpen = $state(false);
  let qaName = $state('');
  let qaBrand = $state('Generic');
  let qaCategory = $state('Footwear');
  let qaSize = $state('');
  let qaColour = $state('');
  let qaPrice = $state('');
  let qaCost = $state('');
  let qaBarcode = $state('');
  let qaBusy = $state(false);

  // Checkout & History state
  let busy = $state(false);
  let activeReceipt = $state<PosReceiptDetails | null>(null);
  let receiptIsSuccess = $state(false);
  let recentSales = $state<any[]>([]);
  let loadingSales = $state(false);
  let voidingSaleId = $state<string | null>(null);
  let billSection: HTMLElement | undefined = $state();

  // ---------------- lifecycle & persistence ----------------
  let draftLoaded = false;

  onMount(() => {
    autoPcPrint = loadAutoPcPrint();
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

  // Fetch recent sales when location changes
  $effect(() => {
    if (locationId) {
      fetchRecentSales(locationId);
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

  // Today's sales stats from recentSales
  const todayStats = $derived.by(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    let count = 0;
    let revenue = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    for (const s of recentSales) {
      if (s.status === 'cancelled') continue;
      const dStr = (s.created_at || '').slice(0, 10);
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
    app.toast(`+${qty} added: ${v.products?.name || v.sku} (Sz ${dispSz})`, 'success');
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

    // 4. Not in catalog -> Offer Emergency Quick Add!
    qaBarcode = raw.trim();
    qaName = baseSku || raw.trim();
    qaSize = size || '';
    quickAddOpen = true;
    SoundFx.warning();
    app.toast(`Code "${raw.trim()}" not in catalog — Quick Add opened!`, 'warning');
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

  // ---------------- emergency quick add item ----------------
  async function submitQuickAdd() {
    if (!qaName.trim()) {
      app.toast('Please enter Shoe Name / Code.', 'warning');
      return;
    }
    const priceNum = parseFloat(String(qaPrice)) || 0;
    if (priceNum <= 0) {
      app.toast('Please enter a valid Selling Price.', 'warning');
      return;
    }
    qaBusy = true;
    try {
      const costNum = parseFloat(String(qaCost)) || 0;
      const skuCode =
        qaName.trim().toUpperCase().replace(/\s+/g, '-') +
        (qaSize.trim() ? `-${qaSize.trim()}` : '');

      // 1. Insert product
      const prodRes = await restWrite<any[]>('POST', 'products', {
        name: qaName.trim(),
        brand: qaBrand.trim() || 'Generic',
        category: qaCategory.trim() || 'Footwear',
        status: 'active',
      });
      const prod = Array.isArray(prodRes) ? prodRes[0] : prodRes;

      // 2. Insert variant
      const varRes = await restWrite<any[]>('POST', 'product_variants', {
        product_id: prod.id,
        sku: skuCode,
        barcode: qaBarcode.trim() || null,
        size: qaSize.trim() || null,
        colour: qaColour.trim() || null,
        selling_price: priceNum,
        cost_price: costNum,
      });
      const newVarRaw = Array.isArray(varRes) ? varRes[0] : varRes;
      const fullVariant: Variant = {
        ...newVarRaw,
        products: {
          id: prod.id,
          name: prod.name,
          brand: prod.brand,
          category: prod.category,
        },
      };

      // 3. Add to local catalog & bill
      app.catalog.unshift(fullVariant);
      app.productsMap.set(prod.id, [fullVariant]);
      addVariantToBill(fullVariant, 1);

      quickAddOpen = false;
      qaName = '';
      qaSize = '';
      qaColour = '';
      qaPrice = '';
      qaCost = '';
      qaBarcode = '';
    } catch (e: any) {
      app.toast('Quick Add failed: ' + (e.message || 'Error'), 'error');
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
        `sales?location_id=eq.${locId}&select=id,invoice_no,total,discount,payment_method,status,created_at,customer_id,cashier_id,sale_items(id,variant_id,quantity,unit_price,discount)&order=created_at.desc&limit=25`,
      );
      recentSales = data || [];
    } catch (e) {
      console.warn('Could not load recent sales', e);
    } finally {
      loadingSales = false;
    }
  }

  function buildReceiptFromPastSale(s: any): PosReceiptDetails {
    const branchName = activeLoc?.name || 'Fashion Feet';
    const staffObj = app.allStaff.find((st) => st.id === s.cashier_id);
    const items = (s.sale_items || []).map((si: any) => {
      const v = app.catalog.find((c) => c.id === si.variant_id);
      const uPrice = Number(si.unit_price) || 0;
      const q = Number(si.quantity) || 1;
      return {
        sku: v?.sku || 'ITEM',
        name: v?.products?.name || v?.sku || 'Shoe Item',
        brand: v?.products?.brand || '',
        size: v?.size || '',
        displaySize: getShoeDisplaySize(v?.size, v?.products),
        colour: v?.colour || '',
        qty: q,
        unitPrice: uPrice,
        lineTotal: uPrice * q,
      };
    });
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
      cashierName: staffObj?.name || 'Staff',
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

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="btn btn-sm h-7 px-2.5 text-[11px]"
              onclick={() => (quickAddOpen = true)}
              title="Emergency Quick Add for unlisted items"
            >
              <PackagePlus class="h-3.5 w-3.5 text-warn" />
              <span>+ Quick Item</span>
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
                  <li>
                    <button
                      type="button"
                      class="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-raised"
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
                          {st} in stock
                        </div>
                      </div>
                    </button>
                  </li>
                {:else}
                  <li class="p-5 text-center space-y-2">
                    <p class="text-xs text-muted">No catalog item found for "{debounced}"</p>
                    <button
                      type="button"
                      class="btn btn-sm"
                      onclick={() => {
                        qaName = debounced.trim();
                        quickAddOpen = true;
                        resetSearch();
                      }}
                    >
                      <PackagePlus class="h-3.5 w-3.5 text-warn" />
                      <span>Quick Add "{debounced.trim()}" &amp; Sell</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>

        <!-- Active Model 1-Tap Size Selector Bar -->
        {#if activeModelSiblings.length > 1}
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
                  <!-- Editable Unit Price -->
                  <div class="flex items-center gap-1">
                    <span class="text-[10px] text-dim">Rs.</span>
                    <input
                      type="number"
                      class="input h-8 w-24 px-2 text-right font-mono text-xs font-semibold"
                      bind:value={line.unitPrice}
                      min="0"
                      title="Unit selling price (editable)"
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
            <Printer class="h-4 w-4 shrink-0 {autoPcPrint ? 'text-ok' : 'text-dim'}" />
            <div class="min-w-0">
              <div class="text-xs font-bold text-fg">
                Auto-Print on Counter PC ({activeLoc?.name || 'Branch'})
              </div>
              <div class="text-[10px] text-muted">
                PC POS එක ON නම් USB Printer එකෙන් ස්වයංක්‍රීයව බිල Print වේ
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

  <!-- RECENT POS BILLS / SALES REGISTER -->
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between border-b border-line bg-raised/40 px-4 py-3">
      <div>
        <h2 class="text-xs font-bold uppercase tracking-wider text-fg">
          Recent Branch POS Bills ({activeLoc?.name || 'Branch'})
        </h2>
        <p class="text-[11px] text-dim">
          Reprint on Counter PC printer, send WhatsApp receipt, or cancel mistaken bills
        </p>
      </div>
      <button
        type="button"
        class="btn btn-sm h-8"
        onclick={() => fetchRecentSales(locationId)}
        disabled={loadingSales}
      >
        <RefreshCw class="h-3.5 w-3.5 {loadingSales ? 'animate-spin' : ''}" />
        <span>Refresh</span>
      </button>
    </div>

    {#if recentSales.length === 0}
      <div class="p-8 text-center text-xs text-muted">
        {loadingSales ? 'Loading recent branch bills...' : 'No POS sales recorded at this branch yet.'}
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="bg-raised border-b border-line">
            <tr>
              <th class="th py-2.5 pl-4">Invoice</th>
              <th class="th py-2.5">Date &amp; Time</th>
              <th class="th py-2.5">Items</th>
              <th class="th py-2.5 text-center">Payment</th>
              <th class="th py-2.5 text-right">Total</th>
              <th class="th py-2.5 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            {#each recentSales as s (s.id)}
              {@const isCancelled = s.status === 'cancelled'}
              {@const itemCount = (s.sale_items || []).reduce((n: number, i: any) => n + (Number(i.quantity) || 0), 0)}
              <tr class="hover:bg-raised/30 {isCancelled ? 'opacity-50' : ''}">
                <td class="td py-2.5 pl-4 font-mono font-bold text-fg">
                  {formatInvoiceNo(s.invoice_no, s.id)}
                  {#if isCancelled}
                    <span class="ml-1 chip border-bad/30 bg-bad/10 text-bad text-[9px] py-0">CANCELLED</span>
                  {/if}
                </td>
                <td class="td py-2.5 text-muted">
                  {new Date(s.created_at).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td class="td py-2.5 font-mono text-muted">
                  {itemCount} pair{itemCount === 1 ? '' : 's'}
                </td>
                <td class="td py-2.5 text-center">
                  <span class="chip py-0 text-[10px] uppercase font-mono">{s.payment_method || 'cash'}</span>
                </td>
                <td class="td py-2.5 text-right font-mono font-bold text-fg">
                  {fmtMoney(Number(s.total) || 0)}
                </td>
                <td class="td py-2.5 pr-4 text-right">
                  <div class="inline-flex items-center gap-1.5">
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
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<!-- Emergency Quick Add Unlisted Item Modal -->
{#if quickAddOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
    <div class="card w-full max-w-md overflow-hidden shadow-2xl">
      <div class="flex items-center justify-between border-b border-line bg-raised px-4 py-3">
        <div class="flex items-center gap-2">
          <PackagePlus class="h-4 w-4 text-warn" />
          <h3 class="font-display text-sm font-bold text-fg">
            Quick Add &amp; Sell Unlisted Shoe
          </h3>
        </div>
        <button class="btn btn-ghost btn-sm size-7 p-0" onclick={() => (quickAddOpen = false)}>
          <X class="size-4" />
        </button>
      </div>

      <div class="p-4 space-y-3 text-xs">
        <div>
          <label for="qa-name" class="label">Shoe Code / Model Name *</label>
          <input
            id="qa-name"
            type="text"
            class="input h-9 text-xs"
            placeholder="e.g. SFW099 or Ladies Sandal"
            bind:value={qaName}
          />
        </div>

        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label for="qa-size" class="label">Shoe Size</label>
            <input
              id="qa-size"
              type="text"
              class="input h-9 text-xs font-mono"
              placeholder="e.g. 40"
              bind:value={qaSize}
            />
          </div>
          <div>
            <label for="qa-colour" class="label">Colour</label>
            <input
              id="qa-colour"
              type="text"
              class="input h-9 text-xs"
              placeholder="e.g. Black"
              bind:value={qaColour}
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label for="qa-price" class="label">Selling Price (Rs.) *</label>
            <input
              id="qa-price"
              type="number"
              class="input h-9 text-xs font-mono font-bold"
              placeholder="e.g. 3500"
              bind:value={qaPrice}
            />
          </div>
          <div>
            <label for="qa-cost" class="label">Cost Price (Optional)</label>
            <input
              id="qa-cost"
              type="number"
              class="input h-9 text-xs font-mono"
              placeholder="0"
              bind:value={qaCost}
            />
          </div>
        </div>
      </div>

      <div class="flex gap-2 border-t border-line bg-surface p-3.5">
        <button type="button" class="btn flex-1 h-9 text-xs" onclick={() => (quickAddOpen = false)}>
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary flex-[1.5] h-9 text-xs"
          onclick={submitQuickAdd}
          disabled={qaBusy}
        >
          <span>{qaBusy ? 'Adding...' : 'Add to Catalog & Bill'}</span>
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
