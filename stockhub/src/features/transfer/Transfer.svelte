<script lang="ts">
  import { tick } from 'svelte';
  import {
    ArrowLeftRight, ArrowRight, Building2, Store, Check, ChevronDown, Search, X, ScanLine, Camera, Zap,
    Plus, Minus, Trash2, Send, Loader2, RefreshCw, PackageOpen, Layers,
  } from 'lucide-svelte';
  import { app, getShoeDisplaySize, fmtMoney } from '../../lib/app.svelte';
  import { restGet, restWrite } from '../../lib/api';
  import { SoundFx } from '../../lib/sound';
  import type { Variant, Location } from '../../lib/types';
  import type { VoucherDetails } from '../../lib/voucher';
  import Voucher from './Voucher.svelte';
  import CameraScanner from './CameraScanner.svelte';
  import TransferLog from '../history/TransferLog.svelte';

  // ---------------- local UI state ----------------
  let openDd = $state<'from' | 'to' | null>(null);
  let query = $state('');
  let debounced = $state('');
  let showResults = $state(false);
  let staged = $state<Variant | null>(null);
  let stagedQty = $state(1);
  let mode = $state<'received' | 'dispatched'>('received');
  let notes = $state('');
  let busy = $state(false);
  let voucher = $state<VoucherDetails | null>(null);
  let cameraOpen = $state(false);
  let logToken = $state(0);
  let pulseIdx = $state(-1);
  let searchInput: HTMLInputElement | undefined = $state();
  let cartSection: HTMLElement | undefined = $state();
  let debounceTimer: ReturnType<typeof setTimeout>;

  // ---------------- derived ----------------
  const fromLoc = $derived(app.locations.find((l) => l.id === app.fromId));
  const toLoc = $derived(app.locations.find((l) => l.id === app.toId));
  const otherLoc = $derived(app.locations.find((l) => l.id !== app.fromId && l.id !== app.toId));
  const fromTotal = $derived(app.syncVersion >= 0 ? app.totalStockAt(app.fromId) : 0);
  const toTotal = $derived(app.syncVersion >= 0 ? app.totalStockAt(app.toId) : 0);
  const totalPairs = $derived(app.cart.reduce((s, i) => s + i.qty, 0));
  const totalValue = $derived(app.cart.reduce((s, i) => s + Number(i.variant.selling_price || 0) * i.qty, 0));

  function runSearch(q0: string): Variant[] {
    if (!q0 || q0.trim().length < 2) return [];
    const q = q0.trim().toUpperCase();
    const fromId = app.fromId;
    const matches = app.catalog.filter((v) => {
      const barcodeMatch = v.barcode && v.barcode.toUpperCase() === q;
      const skuMatch = v.sku && v.sku.toUpperCase().includes(q);
      const nameMatch = v.products?.name && v.products.name.toUpperCase().includes(q);
      const brandMatch = v.products?.brand && v.products.brand.toUpperCase().includes(q);
      const dispSz = getShoeDisplaySize(v.size, v.products);
      const sizeMatch = (v.size && v.size.toString().trim() === q) || dispSz.toUpperCase().includes(q);
      const catMatch = v.products?.category && v.products.category.toUpperCase().includes(q);
      return barcodeMatch || skuMatch || nameMatch || brandMatch || sizeMatch || catMatch;
    });
    matches.sort((a, b) => {
      const aExact = (a.barcode && a.barcode.toUpperCase() === q) || (a.sku && a.sku.toUpperCase() === q);
      const bExact = (b.barcode && b.barcode.toUpperCase() === q) || (b.sku && b.sku.toUpperCase() === q);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return app.getStock(b.id, fromId) - app.getStock(a.id, fromId);
    });
    return matches.slice(0, 25);
  }
  const results = $derived(runSearch(debounced));
  const queryActive = $derived(debounced.trim().length >= 2);

  const siblings = $derived.by(() => {
    if (!staged) return [];
    const pId = staged.product_id || staged.products?.id;
    const list = [...((pId && app.productsMap.get(pId)) || [staged])];
    return list.sort((a, b) => {
      const na = parseFloat(a.size as string);
      const nb = parseFloat(b.size as string);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return (a.size || '').localeCompare(b.size || '');
    });
  });

  // ---------------- helpers ----------------
  const locLabel = (l: Location) => (app.isWarehouse(l) ? 'Central warehouse' : 'Retail showroom');
  const stockTone = (n: number) => (n <= 0 ? 'text-bad' : n < 5 ? 'text-warn' : 'text-ok');
  const focusScanner = () => setTimeout(() => app.currentUser && searchInput?.focus(), 250);

  function resetSearch() {
    query = '';
    debounced = '';
    showResults = false;
  }

  // ---------------- route ----------------
  function pickBranch(type: 'from' | 'to', id: string) {
    if (type === 'from') {
      app.fromId = id;
      if (app.toId === id) {
        const other = app.locations.find((l) => l.id !== id);
        if (other) app.toId = other.id;
      }
    } else {
      app.toId = id;
      if (app.fromId === id) {
        const other = app.locations.find((l) => l.id !== id);
        if (other) app.fromId = other.id;
      }
    }
    openDd = null;
    SoundFx.scan();
  }
  function swap() {
    [app.fromId, app.toId] = [app.toId, app.fromId];
    SoundFx.scan();
    app.toast('Dispatch and Receiving branches swapped!', 'info');
  }

  // ---------------- search / scan ----------------
  function onInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounced = query;
      showResults = true;
    }, 120);
  }

  function stage(v: Variant) {
    staged = v;
    stagedQty = 1;
    SoundFx.scan();
  }

  function pickVariant(v: Variant, fromScanOrSelect = true) {
    if (app.autoScan) {
      addToCart(v, 1);
      SoundFx.scan();
    } else if (fromScanOrSelect) {
      stage(v);
    }
  }

  function handleScanInput(raw: string) {
    if (!raw || raw.trim().length === 0) return;
    const q = raw.trim().toUpperCase();
    const exact = app.catalog.find(
      (v) => (v.barcode && v.barcode.toUpperCase() === q) || (v.sku && v.sku.toUpperCase() === q),
    );
    if (exact) {
      pickVariant(exact);
      resetSearch();
      return;
    }
    const found = runSearch(raw);
    if (found.length === 1) {
      pickVariant(found[0]);
      resetSearch();
      return;
    }
    debounced = raw;
    showResults = true;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceTimer);
      handleScanInput(query);
    }
  }

  function selectResult(v: Variant) {
    pickVariant(v);
    resetSearch();
    focusScanner();
  }

  // ---------------- cart ----------------
  async function addToCart(variant: Variant, qty = 1) {
    const availableStock = app.getStock(variant.id, app.fromId);
    const idx = app.cart.findIndex((i) => i.variant.id === variant.id);
    let target = idx;
    if (idx >= 0) {
      app.cart[idx].qty += qty;
      app.cart[idx].availableStock = availableStock;
    } else {
      app.cart.unshift({ variant, qty, availableStock });
      target = 0;
    }
    pulseIdx = target;
    setTimeout(() => (pulseIdx = -1), 1200);
    app.toast(`+${qty} pr added: ${variant.products?.name || variant.sku} (Size ${variant.size || 'N/A'})`, 'success');
    await tick();
  }

  function addStaged() {
    if (!staged) return;
    const qty = Math.trunc(Number(stagedQty));
    if (isNaN(qty) || qty <= 0) {
      app.toast('Please enter a valid transfer quantity!', 'warning');
      SoundFx.warning();
      return;
    }
    addToCart(staged, qty);
    SoundFx.scan();
    staged = null;
    focusScanner();
  }

  function setMax() {
    if (!staged) return;
    stagedQty = Math.max(1, app.getStock(staged.id, app.fromId));
    SoundFx.scan();
  }

  function changeQty(idx: number, delta: number) {
    const line = app.cart[idx];
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) {
      app.cart.splice(idx, 1);
      app.toast('Item removed from batch', 'info');
    }
    SoundFx.scan();
  }
  function setQty(idx: number, val: string) {
    const n = parseInt(val, 10);
    const line = app.cart[idx];
    if (!line || isNaN(n)) return;
    if (n <= 0) {
      app.cart.splice(idx, 1);
      app.toast('Item removed from batch', 'info');
    } else line.qty = n;
  }
  function removeLine(idx: number) {
    if (!app.cart[idx]) return;
    app.cart.splice(idx, 1);
    SoundFx.scan();
    app.toast('Item removed from batch', 'info');
  }
  function clearCart() {
    if (app.cart.length === 0) return;
    if (confirm('Are you sure you want to clear all items from the current transfer batch?')) {
      app.cart = [];
      SoundFx.scan();
      app.toast('Transfer batch cleared', 'info');
      focusScanner();
    }
  }

  // ---------------- dispatch saga ----------------
  async function confirmAndDispatch() {
    if (!app.currentUser) {
      app.toast('Please sign in with your staff account first to dispatch transfers!', 'warning');
      SoundFx.warning();
      app.openLogin(true);
      return;
    }
    if (app.cart.length === 0) {
      app.toast('Transfer batch is empty! Add shoe items first.', 'warning');
      SoundFx.warning();
      return;
    }
    const fromLocId = app.fromId;
    const toLocId = app.toId;
    if (!fromLocId || !toLocId) {
      app.toast('Please select both Dispatch and Receiving branches!', 'warning');
      SoundFx.warning();
      return;
    }
    if (fromLocId === toLocId) {
      app.toast('Dispatch and Receiving branches cannot be identical!', 'error');
      SoundFx.warning();
      return;
    }

    const transferStatus = mode;
    const stockWarnings: string[] = [];
    for (const item of app.cart) {
      const stock = app.getStock(item.variant.id, fromLocId);
      if (item.qty > stock) stockWarnings.push(`${item.variant.sku} (Transfer: ${item.qty}, Shop has: ${stock})`);
    }
    if (stockWarnings.length > 0) {
      const proceed = confirm(
        `Warning: ${stockWarnings.length} item(s) exceed available stock at source:\n\n${stockWarnings.slice(0, 4).join('\n')}\n\nDo you still wish to proceed with the transfer?`,
      );
      if (!proceed) return;
    }

    busy = true;
    try {
      const fromShopName = fromLoc?.name ?? '';
      const toShopName = toLoc?.name ?? '';
      const driverNotes = notes.trim();
      const nowIso = new Date().toISOString();
      const currentUserId = app.currentUser?.id ? app.currentUser.id : 'd0e59b77-058d-45df-b907-fb45d9486b34';

      // 1. master record
      const transferData = await restWrite<{ id: string }[]>('POST', 'transfers', {
        from_location: fromLocId,
        to_location: toLocId,
        status: transferStatus,
        created_by: currentUserId,
        dispatched_at: nowIso,
        received_at: transferStatus === 'received' ? nowIso : null,
      });
      const transferId = transferData && transferData[0]?.id ? transferData[0].id : `TRN-${Date.now().toString().slice(-6)}`;

      // 2. stock levels + movements
      const items = [...app.cart].map((i) => ({ variant: i.variant, qty: i.qty, availableStock: i.availableStock }));
      for (const item of items) {
        const vId = item.variant.id;
        const qty = item.qty;

        const newFromQty = Math.max(0, app.getStock(vId, fromLocId) - qty);
        const sFrom = await restGet<{ id: string }[]>(`stock_levels?variant_id=eq.${vId}&location_id=eq.${fromLocId}`);
        if (sFrom && sFrom.length > 0) {
          await restWrite('PATCH', `stock_levels?id=eq.${sFrom[0].id}`, { quantity: newFromQty, updated_at: nowIso });
        } else {
          await restWrite('POST', 'stock_levels', { variant_id: vId, location_id: fromLocId, quantity: 0, updated_at: nowIso });
        }
        app.stockMap.set(`${vId}_${fromLocId}`, newFromQty);

        const newToQty = app.getStock(vId, toLocId) + qty;
        const sTo = await restGet<{ id: string }[]>(`stock_levels?variant_id=eq.${vId}&location_id=eq.${toLocId}`);
        if (sTo && sTo.length > 0) {
          await restWrite('PATCH', `stock_levels?id=eq.${sTo[0].id}`, { quantity: newToQty, updated_at: nowIso });
        } else {
          await restWrite('POST', 'stock_levels', { variant_id: vId, location_id: toLocId, quantity: qty, updated_at: nowIso });
        }
        app.stockMap.set(`${vId}_${toLocId}`, newToQty);

        try {
          await restWrite('POST', 'stock_movements', [
            { variant_id: vId, from_location: fromLocId, to_location: null, quantity: -qty, type: 'branch_transfer', reference_id: transferId.toString(), created_by: currentUserId, created_at: nowIso },
            { variant_id: vId, from_location: null, to_location: toLocId, quantity: qty, type: 'branch_transfer', reference_id: transferId.toString(), created_by: currentUserId, created_at: nowIso },
          ]);
        } catch (e) {
          console.warn('Stock movement log error:', e);
        }
      }

      // 3. voucher
      SoundFx.success();
      voucher = {
        id: transferId,
        fromName: fromShopName,
        toName: toShopName,
        status: transferStatus,
        driverNotes,
        dispatchedByName: app.currentUser?.name || 'Staff',
        date: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
        items,
      };

      // 4. reset
      app.cart = [];
      notes = '';
      logToken++;
      app.toast('Transfer confirmed and inventory synced!', 'success');
      app.syncCatalogAndStock(true);
    } catch (err: any) {
      console.error('Transfer execution error:', err);
      app.toast('Transfer failed: ' + (err.message || 'Network error'), 'error');
      SoundFx.warning();
    } finally {
      busy = false;
    }
  }

  function closeVoucher() {
    voucher = null;
    focusScanner();
  }

  function onWindowClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (!t.closest('[data-dd]')) openDd = null;
    if (!t.closest('[data-search]')) showResults = false;
  }
</script>

<svelte:window onclick={onWindowClick} />

{#snippet picker(type: 'from' | 'to')}
  {@const loc = type === 'from' ? fromLoc : toLoc}
  {@const total = type === 'from' ? fromTotal : toTotal}
  {@const isOpen = openDd === type}
  <div class="relative min-w-0 flex-1" data-dd>
    <span class="label" id="{type}-lbl">{type === 'from' ? 'Dispatch from' : 'Deliver to'}</span>
    <button
      type="button"
      class="flex w-full items-center gap-3 rounded-xl border border-line bg-raised p-3 text-left transition hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-labelledby="{type}-lbl"
      onclick={() => (openDd = isOpen ? null : type)}
    >
      <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
        {#if app.isWarehouse(loc)}<Building2 class="size-5" />{:else}<Store class="size-5" />{/if}
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-semibold text-fg">{loc?.name ?? (type === 'from' ? 'Select branch' : 'Select destination')}</span>
        <span class="block truncate text-xs text-muted">
          {app.isWarehouse(loc) ? 'Central distribution hub' : 'Retail showroom & shop'} · Stock: {total.toLocaleString()} prs
        </span>
      </span>
      <ChevronDown class="size-4 shrink-0 text-dim transition {isOpen ? 'rotate-180' : ''}" />
    </button>
    {#if isOpen}
      <ul class="absolute left-0 right-0 z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl" role="listbox" aria-labelledby="{type}-lbl">
        {#each app.locations as l (l.id)}
          {@const sel = l.id === (type === 'from' ? app.fromId : app.toId)}
          {@const st = app.totalStockAt(l.id)}
          <li role="option" aria-selected={sel}>
            <button type="button" class="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-raised {sel ? 'bg-accent-soft' : ''}" onclick={() => pickBranch(type, l.id)}>
              <span class="grid size-8 shrink-0 place-items-center rounded-md bg-raised text-muted">
                {#if app.isWarehouse(l)}<Building2 class="size-4" />{:else}<Store class="size-4" />{/if}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-fg">{l.name}</span>
                <span class="block truncate text-xs text-muted">{locLabel(l)} · {st > 0 ? `${st.toLocaleString()} prs available` : '0 prs in stock'}</span>
              </span>
              {#if sel}<Check class="size-4 text-accent" />{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/snippet}

<div class="mx-auto w-full max-w-6xl space-y-5 p-4 pb-28 sm:p-6 lg:pb-8">
  <!-- STEP 1: ROUTE -->
  <section class="card p-4 sm:p-5" aria-labelledby="route-h">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 id="route-h" class="text-sm font-semibold text-fg">1. Transfer route</h2>
        <p class="text-xs text-muted">Choose where stock leaves and where it arrives.</p>
      </div>
      <button class="btn btn-sm" onclick={() => { SoundFx.scan(); app.syncCatalogAndStock(); }} disabled={app.isSyncing}>
        <RefreshCw class="size-3.5 {app.isSyncing ? 'animate-spin' : ''}" /> Sync
      </button>
    </div>
    <div class="flex flex-col items-stretch gap-3 md:flex-row md:items-end">
      {@render picker('from')}
      <button type="button" class="btn mx-auto size-10 shrink-0 p-0 md:mb-1" onclick={swap} aria-label="Swap dispatch and receiving branches" title="Swap">
        <ArrowLeftRight class="size-4 rotate-90 md:rotate-0" />
      </button>
      {@render picker('to')}
    </div>
    <p class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted" aria-live="polite">
      <span class="chip">{fromLoc?.name ?? 'Source'}</span>
      <ArrowRight class="size-3.5 text-dim" aria-hidden="true" />
      <span class="chip border-accent/40 text-accent">{toLoc?.name ?? 'Destination'}</span>
    </p>
  </section>

  <div class="grid gap-5 lg:grid-cols-5">
    <!-- STEP 2: SEARCH + STAGE -->
    <section class="card space-y-4 p-4 sm:p-5 lg:col-span-2" aria-labelledby="scan-h">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 id="scan-h" class="text-sm font-semibold text-fg">2. Find shoes</h2>
          <p class="text-xs text-muted">
            {app.autoScan ? 'Instant add: each scan adds +1 to the batch.' : 'Inspection: scan opens a size matrix preview.'}
          </p>
        </div>
        <button
          type="button"
          class="btn btn-sm {app.autoScan ? 'border-accent/50 text-accent' : ''}"
          aria-pressed={app.autoScan}
          onclick={() => {
            app.autoScan = !app.autoScan;
            app.toast(app.autoScan ? 'Instant barcode scan mode on' : 'Inspection mode active (scan opens preview)', app.autoScan ? 'success' : 'info');
            SoundFx.scan();
            focusScanner();
          }}
        >
          {#if app.autoScan}<Zap class="size-3.5" />{:else}<Search class="size-3.5" />{/if}
          Instant scan: {app.autoScan ? 'On' : 'Off'}
        </button>
      </div>

      <div class="relative" data-search>
        <label for="scan-input" class="label">Barcode, SKU, name, brand or size</label>
        <div class="flex gap-2">
          <div class="relative flex-1">
            <ScanLine class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" />
            <input
              id="scan-input"
              bind:this={searchInput}
              bind:value={query}
              oninput={onInput}
              onkeydown={onKeydown}
              onfocus={() => query && (showResults = true)}
              class="input pl-9 pr-9"
              type="text"
              inputmode="search"
              autocomplete="off"
              placeholder="Scan or type to search..."
            />
            {#if query}
              <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-dim hover:text-fg" aria-label="Clear search" onclick={() => { resetSearch(); focusScanner(); }}>
                <X class="size-4" />
              </button>
            {/if}
          </div>
          <button type="button" class="btn shrink-0" onclick={() => (cameraOpen = true)} aria-label="Open camera scanner" title="Camera scanner">
            <Camera class="size-4" />
          </button>
        </div>

        {#if showResults && queryActive}
          <div class="absolute left-0 right-0 z-20 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
            <div class="flex items-center justify-between border-b border-line px-3 py-1.5 text-[11px] uppercase tracking-wider text-dim">
              <span>Results</span><span>{results.length} found</span>
            </div>
            <ul class="max-h-80 overflow-y-auto">
              {#each results as v (v.id)}
                {@const st = app.getStock(v.id, app.fromId)}
                <li>
                  <button type="button" class="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-raised" onclick={() => selectResult(v)}>
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-medium text-fg">{v.products?.brand ? `${v.products.brand} — ` : ''}{v.products?.name || v.sku}</span>
                      <span class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span class="font-mono">{v.sku}</span>
                        <span class="chip py-0">Size {getShoeDisplaySize(v.size, v.products)}</span>
                        <span>{v.colour || '-'}</span>
                      </span>
                    </span>
                    <span class="shrink-0 text-right">
                      <span class="block text-sm font-semibold {stockTone(st)}">{st > 0 ? `${st} prs` : '0 prs (out)'}</span>
                      <span class="block text-xs text-muted">Rs. {(v.selling_price || 0).toLocaleString()}</span>
                    </span>
                  </button>
                </li>
              {:else}
                <li class="p-6 text-center text-sm text-muted">No shoe styles found matching "{debounced}"</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      {#if staged}
        {@const fromQty = app.getStock(staged.id, app.fromId)}
        {@const toQty = app.getStock(staged.id, app.toId)}
        <div class="rounded-xl border border-line bg-raised p-4" aria-live="polite">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-[11px] uppercase tracking-wider text-dim">{staged.products?.brand || 'Fashion Feet'} · {staged.products?.category || 'Footwear'}</div>
              <div class="truncate text-base font-semibold text-fg">{staged.products?.name || staged.sku}</div>
              <div class="font-mono text-xs text-muted">SKU: {staged.sku || 'N/A'}</div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" aria-label="Close preview" onclick={() => { staged = null; focusScanner(); }}><X class="size-4" /></button>
          </div>
          <div class="mt-1 font-mono text-sm text-fg">Rs. {(staged.selling_price || 0).toLocaleString()}.00</div>

          <dl class="mt-3 grid gap-1.5 text-xs">
            <div class="flex justify-between"><dt class="text-muted">{fromLoc?.name ?? 'From'}</dt><dd class="font-semibold {stockTone(fromQty)}">{fromQty} prs</dd></div>
            <div class="flex justify-between"><dt class="text-muted">{toLoc?.name ?? 'To'}</dt><dd class="font-semibold {stockTone(toQty)}">{toQty} prs</dd></div>
            {#if otherLoc}
              {@const oq = app.getStock(staged.id, otherLoc.id)}
              <div class="flex justify-between"><dt class="text-muted">{otherLoc.name}</dt><dd class="font-semibold {stockTone(oq)}">{oq} prs</dd></div>
            {/if}
          </dl>

          <div class="mt-3">
            <div class="label">Size matrix (stock at dispatch shop)</div>
            <div class="flex flex-wrap gap-1.5">
              {#each siblings as v (v.id)}
                {@const s = app.getStock(v.id, app.fromId)}
                <button
                  type="button"
                  class="min-w-14 rounded-lg border px-2 py-1.5 text-center transition hover:border-accent/60 {v.id === staged.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}"
                  title="Size {getShoeDisplaySize(v.size, v.products)}: {s} prs"
                  aria-pressed={v.id === staged.id}
                  onclick={() => pickVariant(v)}
                >
                  <span class="block text-sm font-semibold text-fg">{getShoeDisplaySize(v.size, v.products)}</span>
                  <span class="block text-[11px] {s === 0 ? 'text-bad' : 'text-muted'}">{s} prs</span>
                </button>
              {/each}
            </div>
          </div>

          <div class="mt-4 flex items-end gap-2">
            <div class="flex-1">
              <label for="staged-qty" class="label">Quantity</label>
              <div class="flex items-center gap-1">
                <button type="button" class="btn size-9 p-0" aria-label="Decrease quantity" onclick={() => (stagedQty = Math.max(1, (parseInt(String(stagedQty), 10) || 1) - 1))}><Minus class="size-4" /></button>
                <input id="staged-qty" class="input w-16 text-center" type="number" min="1" bind:value={stagedQty} />
                <button type="button" class="btn size-9 p-0" aria-label="Increase quantity" onclick={() => (stagedQty = (parseInt(String(stagedQty), 10) || 1) + 1)}><Plus class="size-4" /></button>
                <button type="button" class="btn btn-sm ml-1" onclick={setMax}>Max</button>
              </div>
            </div>
            <button type="button" class="btn btn-primary" onclick={addStaged}><Plus class="size-4" /> Add to batch</button>
          </div>
        </div>
      {:else if app.catalog.length === 0}
        <p class="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">Catalog is loading...</p>
      {/if}
    </section>

    <!-- STEP 3: CART + DISPATCH -->
    <section class="card flex flex-col lg:col-span-3" aria-labelledby="cart-h" bind:this={cartSection}>
      <div class="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div>
          <h2 id="cart-h" class="text-sm font-semibold text-fg">3. Transfer batch</h2>
          <p class="text-xs text-muted">{app.cart.length} styles · {totalPairs} pairs</p>
        </div>
        <button class="btn btn-sm btn-danger" onclick={clearCart} disabled={app.cart.length === 0}><Trash2 class="size-3.5" /> Clear all</button>
      </div>

      {#if app.cart.length === 0}
        <div class="flex flex-col items-center gap-2 px-4 py-14 text-center">
          <PackageOpen class="size-8 text-dim" aria-hidden="true" />
          <p class="text-sm font-medium text-fg">Your batch is empty</p>
          <p class="text-xs text-muted">Scan a barcode or search to add shoes to this transfer.</p>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full min-w-[560px]">
            <thead class="bg-raised/50">
              <tr><th class="th w-8">#</th><th class="th">Item</th><th class="th">Size</th><th class="th">Stock</th><th class="th">Qty</th><th class="th text-right">Price</th><th class="th w-10"><span class="sr-only">Remove</span></th></tr>
            </thead>
            <tbody class="divide-y divide-line">
              {#each app.cart as item, idx (item.variant.id)}
                {@const v = item.variant}
                {@const cur = app.getStock(v.id, app.fromId)}
                <tr class="transition-colors duration-700 {pulseIdx === idx ? 'bg-accent-soft' : ''}">
                  <td class="td text-dim">{idx + 1}</td>
                  <td class="td">
                    <div class="font-medium text-fg">{v.products?.brand ? v.products.brand + ' ' : ''}{v.products?.name || v.sku}</div>
                    <div class="font-mono text-[11px] text-dim">SKU: {v.sku}{v.barcode ? ` · Barcode: ${v.barcode}` : ''}</div>
                  </td>
                  <td class="td">
                    <span class="chip">Size {getShoeDisplaySize(v.size, v.products)}</span>
                    <div class="mt-0.5 text-[11px] text-muted">{v.colour || '-'}</div>
                  </td>
                  <td class="td"><span class="text-xs font-semibold {cur >= item.qty ? 'text-ok' : 'text-bad'}">{cur} prs</span></td>
                  <td class="td">
                    <div class="flex items-center gap-1">
                      <button class="btn size-7 p-0" aria-label="Decrease quantity" onclick={() => changeQty(idx, -1)}><Minus class="size-3.5" /></button>
                      <input class="input w-12 px-1 py-1 text-center" type="number" min="1" value={item.qty} aria-label="Quantity" onchange={(e) => setQty(idx, e.currentTarget.value)} />
                      <button class="btn size-7 p-0" aria-label="Increase quantity" onclick={() => changeQty(idx, 1)}><Plus class="size-3.5" /></button>
                    </div>
                  </td>
                  <td class="td text-right font-mono text-xs">Rs. {Number(v.selling_price || 0).toLocaleString()}</td>
                  <td class="td text-center">
                    <button class="rounded p-1.5 text-dim hover:text-bad" aria-label="Remove style from batch" onclick={() => removeLine(idx)}><X class="size-4" /></button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <div class="mt-auto space-y-4 border-t border-line p-4 sm:p-5">
        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="rounded-lg bg-raised p-3"><div class="text-[11px] uppercase tracking-wider text-dim">Styles</div><div class="text-lg font-semibold text-fg">{app.cart.length}</div></div>
          <div class="rounded-lg bg-raised p-3"><div class="text-[11px] uppercase tracking-wider text-dim">Pairs</div><div class="text-lg font-semibold text-fg">{totalPairs}</div></div>
          <div class="rounded-lg bg-raised p-3"><div class="text-[11px] uppercase tracking-wider text-dim">Retail value</div><div class="text-sm font-semibold leading-7 text-fg">{fmtMoney(totalValue)}</div></div>
        </div>

        <fieldset>
          <legend class="label">Workflow mode</legend>
          <div class="grid gap-2 sm:grid-cols-2">
            {#each [{ v: 'received', t: 'Instant transfer', s: 'Updates stock in both branches now (status: received).' }, { v: 'dispatched', t: 'Dispatch with waybill', s: 'Deducts sender stock; destination receives later (status: dispatched).' }] as o}
              <label class="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 {mode === o.v ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/40'}">
                <input type="radio" name="transferMode" class="mt-1 accent-[var(--accent)]" value={o.v} bind:group={mode} />
                <span><span class="block text-sm font-medium text-fg">{o.t}</span><span class="block text-xs text-muted">{o.s}</span></span>
              </label>
            {/each}
          </div>
        </fieldset>

        <div>
          <label for="transfer-notes" class="label">Dispatch notes / driver / van # (optional)</label>
          <input id="transfer-notes" class="input" type="text" bind:value={notes} placeholder="e.g. Sent via Delivery Van #WP-KD-5432 with Driver Amal" />
        </div>

        <button class="btn btn-primary w-full py-3 text-sm" onclick={confirmAndDispatch} disabled={busy || app.cart.length === 0}>
          {#if busy}<Loader2 class="size-4 animate-spin" /> Processing transfer...{:else}<Send class="size-4" /> Confirm &amp; dispatch transfer{/if}
        </button>
      </div>
    </section>
  </div>

  <!-- AUDIT LOG -->
  <TransferLog refreshToken={logToken} limit={15} />
</div>

<!-- Mobile floating batch button -->
{#if app.cart.length > 0}
  <button
    type="button"
    class="btn btn-primary fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full px-5 py-3 shadow-lg lg:hidden"
    onclick={() => cartSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
  >
    <Layers class="size-4" /> View batch &amp; dispatch · {totalPairs} prs
  </button>
{/if}

{#if voucher}
  <Voucher details={voucher} success onclose={closeVoucher} />
{/if}

{#if cameraOpen}
  <CameraScanner onscan={handleScanInput} onclose={() => (cameraOpen = false)} />
{/if}
