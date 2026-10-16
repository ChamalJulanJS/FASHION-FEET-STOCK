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
    <button
      type="button"
      class="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-raised/70 px-3.5 py-2.5 text-left transition hover:border-fg/30 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      onclick={() => (openDd = isOpen ? null : type)}
    >
      <span class="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted">
        {#if app.isWarehouse(loc)}<Building2 class="size-4" />{:else}<Store class="size-4" />{/if}
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-[10px] font-semibold uppercase tracking-wider text-dim">
          {type === 'from' ? 'Dispatch From (Source)' : 'Deliver To (Destination)'}
        </span>
        <span class="mt-0.5 flex items-center gap-2">
          <span class="truncate text-sm font-semibold text-fg">
            {loc?.name ?? (type === 'from' ? 'Select source branch' : 'Select destination branch')}
          </span>
          <span class="chip font-mono text-[10px] py-0">{total.toLocaleString()} prs</span>
        </span>
      </span>
      <ChevronDown class="size-4 shrink-0 text-dim transition {isOpen ? 'rotate-180' : ''}" />
    </button>
    {#if isOpen}
      <ul
        class="absolute left-0 right-0 z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-2xl"
        role="listbox"
      >
        {#each app.locations as l (l.id)}
          {@const sel = l.id === (type === 'from' ? app.fromId : app.toId)}
          {@const st = app.totalStockAt(l.id)}
          <li role="option" aria-selected={sel}>
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-raised {sel ? 'bg-raised ring-1 ring-line' : ''}"
              onclick={() => pickBranch(type, l.id)}
            >
              <span class="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-surface text-muted">
                {#if app.isWarehouse(l)}<Building2 class="size-4" />{:else}<Store class="size-4" />{/if}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-xs font-semibold text-fg">{l.name}</span>
                <span class="block truncate text-[11px] text-dim">
                  {locLabel(l)} · <span class="font-mono text-muted">{st.toLocaleString()} prs</span>
                </span>
              </span>
              {#if sel}<Check class="size-4 shrink-0 text-fg" />{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/snippet}

<div class="space-y-4">
  <!-- STEP 1: COMPACT ROUTE BAR -->
  <section class="card p-3.5 sm:px-5 sm:py-4" aria-labelledby="route-h">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div class="flex items-center justify-between gap-3 lg:w-52 lg:shrink-0">
        <div class="flex items-center gap-2.5">
          <span class="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-raised font-mono text-[11px] font-bold text-fg">01</span>
          <div>
            <h2 id="route-h" class="text-xs font-semibold uppercase tracking-wider text-fg">Transfer Route</h2>
            <p class="text-[11px] text-dim">Source &amp; destination</p>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-sm lg:hidden"
          onclick={() => { SoundFx.scan(); app.syncCatalogAndStock(); }}
          disabled={app.isSyncing}
        >
          <RefreshCw class="size-3.5 {app.isSyncing ? 'animate-spin' : ''}" />
          <span>Sync</span>
        </button>
      </div>

      <div class="flex flex-1 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {@render picker('from')}
        <button
          type="button"
          class="btn mx-auto size-9 shrink-0 p-0"
          onclick={swap}
          aria-label="Swap dispatch and receiving branches"
          title="Swap dispatch & receiving branches"
        >
          <ArrowLeftRight class="size-3.5 rotate-90 sm:rotate-0" />
        </button>
        {@render picker('to')}
      </div>
    </div>
  </section>

  <!-- MAIN WORKSPACE GRID -->
  <div class="grid gap-4 lg:grid-cols-12 lg:items-start">
    <!-- STEP 2: SCAN & FIND SHOES (5 cols) -->
    <section class="card flex flex-col gap-4 p-4 sm:p-5 lg:col-span-5" aria-labelledby="scan-h">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2.5">
          <span class="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-raised font-mono text-[11px] font-bold text-fg">02</span>
          <div>
            <h2 id="scan-h" class="text-xs font-semibold uppercase tracking-wider text-fg">Find Footwear</h2>
            <p class="text-[11px] text-dim">
              {app.autoScan ? 'Instant mode: barcode scan adds +1 immediately' : 'Inspect mode: select size & quantity before adding'}
            </p>
          </div>
        </div>

        <!-- Segmented Scan Mode Switch -->
        <div class="inline-flex items-center rounded-lg border border-line bg-raised p-0.5 text-[11px]" role="group" aria-label="Scanner mode">
          <button
            type="button"
            class="cursor-pointer rounded-md px-2.5 py-1 font-medium transition {!app.autoScan ? 'bg-surface text-fg shadow-xs ring-1 ring-line' : 'text-dim hover:text-fg'}"
            onclick={() => {
              if (app.autoScan) {
                app.autoScan = false;
                app.toast('Inspection mode active (scan opens size matrix)', 'info');
                SoundFx.scan();
                focusScanner();
              }
            }}
          >
            Inspect
          </button>
          <button
            type="button"
            class="inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 font-medium transition {app.autoScan ? 'bg-fg text-bg font-semibold shadow-xs' : 'text-dim hover:text-fg'}"
            onclick={() => {
              if (!app.autoScan) {
                app.autoScan = true;
                app.toast('Instant barcode scan mode ON (+1 per scan)', 'success');
                SoundFx.scan();
                focusScanner();
              }
            }}
          >
            <Zap class="size-3" />
            <span>Auto +1</span>
          </button>
        </div>
      </div>

      <!-- Integrated Search + Camera Bar -->
      <div class="relative" data-search>
        <label for="scan-input" class="sr-only">Barcode, SKU, name, brand or size</label>
        <div class="relative flex items-center">
          <ScanLine class="pointer-events-none absolute left-3.5 size-4 text-dim" />
          <input
            id="scan-input"
            bind:this={searchInput}
            bind:value={query}
            oninput={onInput}
            onkeydown={onKeydown}
            onfocus={() => query && (showResults = true)}
            class="input h-10 pl-10 pr-24 text-sm"
            type="text"
            inputmode="search"
            autocomplete="off"
            placeholder="Scan barcode or search SKU, model, size..."
          />
          <div class="absolute right-1.5 flex items-center gap-1">
            {#if query}
              <button
                type="button"
                class="grid size-7 cursor-pointer place-items-center rounded-md text-dim hover:bg-surface hover:text-fg"
                aria-label="Clear search"
                onclick={() => { resetSearch(); focusScanner(); }}
              >
                <X class="size-3.5" />
              </button>
            {/if}
            <button
              type="button"
              class="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-line bg-surface px-2 text-[11px] font-medium text-muted transition hover:border-fg/30 hover:text-fg"
              onclick={() => (cameraOpen = true)}
              aria-label="Open camera barcode scanner"
              title="Open camera barcode scanner"
            >
              <Camera class="size-3.5" />
              <span>Scan</span>
            </button>
          </div>
        </div>

        {#if showResults && queryActive}
          <div class="absolute left-0 right-0 z-20 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
            <div class="flex items-center justify-between border-b border-line bg-raised/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
              <span>Matching Variants</span>
              <span class="font-mono">{results.length} found</span>
            </div>
            <ul class="max-h-80 divide-y divide-line overflow-y-auto">
              {#each results as v (v.id)}
                {@const st = app.getStock(v.id, app.fromId)}
                <li>
                  <button
                    type="button"
                    class="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-raised"
                    onclick={() => selectResult(v)}
                  >
                    <span class="min-w-0">
                      <span class="block truncate text-xs font-semibold text-fg">
                        {v.products?.brand ? `${v.products.brand} · ` : ''}{v.products?.name || v.sku}
                      </span>
                      <span class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        <span class="font-mono text-dim">{v.sku}</span>
                        <span class="chip py-0 text-[10px]">Sz {getShoeDisplaySize(v.size, v.products)}</span>
                        {#if v.colour}<span>{v.colour}</span>{/if}
                      </span>
                    </span>
                    <span class="shrink-0 text-right">
                      <span class="block font-mono text-xs font-semibold {stockTone(st)}">
                        {st > 0 ? `${st} prs` : '0 prs'}
                      </span>
                      <span class="block font-mono text-[11px] text-dim">{fmtMoney(v.selling_price || 0)}</span>
                    </span>
                  </button>
                </li>
              {:else}
                <li class="p-6 text-center text-xs text-muted">No shoe styles found matching "{debounced}"</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      <!-- Staged Item Inspector OR Clean Ready State -->
      {#if staged}
        {@const fromQty = app.getStock(staged.id, app.fromId)}
        {@const toQty = app.getStock(staged.id, app.toId)}
        <div class="rounded-xl border border-line bg-raised/60 p-4 space-y-3.5" aria-live="polite">
          <div class="flex items-start justify-between gap-2 border-b border-line pb-3">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-dim">
                <span>{staged.products?.brand || 'Fashion Feet'}</span>
                <span>•</span>
                <span>{staged.products?.category || 'Footwear'}</span>
              </div>
              <div class="mt-0.5 truncate font-display text-base font-bold text-fg">
                {staged.products?.name || staged.sku}
              </div>
              <div class="mt-0.5 flex items-center gap-2 font-mono text-xs text-muted">
                <span>SKU: {staged.sku || 'N/A'}</span>
                <span>•</span>
                <span class="font-semibold text-fg">{fmtMoney(staged.selling_price || 0)}</span>
              </div>
            </div>
            <button
              type="button"
              class="btn btn-ghost btn-sm size-7 p-0"
              aria-label="Close preview"
              onclick={() => { staged = null; focusScanner(); }}
            >
              <X class="size-4" />
            </button>
          </div>

          <!-- Branch Stock Breakdown -->
          <div class="grid grid-cols-3 gap-2 rounded-lg border border-line bg-surface p-2.5 text-center text-xs">
            <div class="min-w-0">
              <div class="truncate text-[10px] uppercase text-dim">{fromLoc?.name ?? 'Source'}</div>
              <div class="mt-0.5 font-mono font-semibold {stockTone(fromQty)}">{fromQty} prs</div>
            </div>
            <div class="min-w-0 border-x border-line px-1">
              <div class="truncate text-[10px] uppercase text-dim">{toLoc?.name ?? 'Target'}</div>
              <div class="mt-0.5 font-mono font-semibold {stockTone(toQty)}">{toQty} prs</div>
            </div>
            {#if otherLoc}
              {@const oq = app.getStock(staged.id, otherLoc.id)}
              <div class="min-w-0">
                <div class="truncate text-[10px] uppercase text-dim">{otherLoc.name}</div>
                <div class="mt-0.5 font-mono font-semibold {stockTone(oq)}">{oq} prs</div>
              </div>
            {/if}
          </div>

          <!-- Size Matrix -->
          <div>
            <div class="label">Select Size (Stock at {fromLoc?.name ?? 'Source'})</div>
            <div class="flex flex-wrap gap-1.5">
              {#each siblings as v (v.id)}
                {@const s = app.getStock(v.id, app.fromId)}
                {@const active = v.id === staged.id}
                <button
                  type="button"
                  class="min-w-[52px] cursor-pointer rounded-lg border px-2.5 py-1.5 text-center transition
                    {active ? 'border-fg bg-fg text-bg shadow-xs' : 'border-line bg-surface text-fg hover:border-fg/40'}"
                  title="Size {getShoeDisplaySize(v.size, v.products)}: {s} prs"
                  aria-pressed={active}
                  onclick={() => pickVariant(v)}
                >
                  <span class="block text-xs font-bold">{getShoeDisplaySize(v.size, v.products)}</span>
                  <span class="block font-mono text-[10px] {active ? 'text-bg/80' : s === 0 ? 'text-bad' : 'text-dim'}">
                    {s} prs
                  </span>
                </button>
              {/each}
            </div>
          </div>

          <!-- Qty + Add Action -->
          <div class="flex items-end justify-between gap-2 pt-1">
            <div>
              <label for="staged-qty" class="label">Transfer Qty</label>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="btn size-8 p-0"
                  aria-label="Decrease quantity"
                  onclick={() => (stagedQty = Math.max(1, (parseInt(String(stagedQty), 10) || 1) - 1))}
                >
                  <Minus class="size-3.5" />
                </button>
                <input
                  id="staged-qty"
                  class="input h-8 w-14 px-1 text-center font-mono text-xs font-semibold"
                  type="number"
                  min="1"
                  bind:value={stagedQty}
                />
                <button
                  type="button"
                  class="btn size-8 p-0"
                  aria-label="Increase quantity"
                  onclick={() => (stagedQty = (parseInt(String(stagedQty), 10) || 1) + 1)}
                >
                  <Plus class="size-3.5" />
                </button>
                <button type="button" class="btn btn-sm h-8 px-2" onclick={setMax}>Max</button>
              </div>
            </div>
            <button type="button" class="btn btn-primary h-8 px-4" onclick={addStaged}>
              <Plus class="size-3.5" />
              <span>Add to Batch</span>
            </button>
          </div>
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-raised/25 px-4 py-8 text-center">
          <ScanLine class="mb-2 size-6 text-dim" />
          <p class="text-xs font-medium text-muted">
            {app.catalog.length === 0 ? 'Syncing product catalog...' : 'Ready for barcode scanner or manual search'}
          </p>
          <p class="mt-1 text-[11px] text-dim">
            Type at least 2 characters or scan a shoe box label and press <kbd class="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">Enter</kbd>
          </p>
        </div>
      {/if}
    </section>

    <!-- STEP 3: TRANSFER BATCH & DISPATCH (7 cols) -->
    <section class="card flex flex-col lg:col-span-7" aria-labelledby="cart-h" bind:this={cartSection}>
      <!-- Batch Header with Inline Metrics -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div class="flex items-center gap-2.5">
          <span class="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-raised font-mono text-[11px] font-bold text-fg">03</span>
          <div>
            <h2 id="cart-h" class="text-xs font-semibold uppercase tracking-wider text-fg">Transfer Batch</h2>
            <p class="text-[11px] text-dim">Review items &amp; confirm stock dispatch</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1.5">
            <span class="chip font-mono">{app.cart.length} Styles</span>
            <span class="chip font-mono font-semibold text-fg">{totalPairs} Pairs</span>
            {#if totalValue > 0}
              <span class="chip hidden font-mono sm:inline-flex">{fmtMoney(totalValue)}</span>
            {/if}
          </div>
          {#if app.cart.length > 0}
            <button class="btn btn-sm btn-danger" onclick={clearCart}>
              <Trash2 class="size-3.5" />
              <span>Clear</span>
            </button>
          {/if}
        </div>
      </div>

      <!-- Batch Table / Empty State -->
      {#if app.cart.length === 0}
        <div class="flex flex-col items-center justify-center gap-1.5 px-4 py-12 text-center">
          <PackageOpen class="size-7 text-dim" aria-hidden="true" />
          <p class="text-xs font-semibold text-fg">No footwear in transfer batch</p>
          <p class="max-w-xs text-[11px] text-dim">
            Scan items on the left or send models directly from the Stock &amp; Reorder matrix.
          </p>
        </div>
      {:else}
        <div class="max-h-[420px] overflow-x-auto overflow-y-auto">
          <table class="w-full min-w-[540px]">
            <thead class="sticky top-0 z-10 border-b border-line bg-surface">
              <tr>
                <th class="th w-8">#</th>
                <th class="th">Footwear Model</th>
                <th class="th">Size</th>
                <th class="th">Source Stock</th>
                <th class="th">Transfer Qty</th>
                <th class="th text-right">Retail</th>
                <th class="th w-9"><span class="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              {#each app.cart as item, idx (item.variant.id)}
                {@const v = item.variant}
                {@const cur = app.getStock(v.id, app.fromId)}
                <tr class="transition-colors duration-500 hover:bg-raised/40 {pulseIdx === idx ? 'bg-raised' : ''}">
                  <td class="td font-mono text-xs text-dim">{idx + 1}</td>
                  <td class="td">
                    <div class="text-xs font-semibold text-fg">
                      {v.products?.brand ? v.products.brand + ' · ' : ''}{v.products?.name || v.sku}
                    </div>
                    <div class="font-mono text-[11px] text-dim">
                      {v.sku}{v.colour ? ` · ${v.colour}` : ''}
                    </div>
                  </td>
                  <td class="td">
                    <span class="chip font-mono text-xs font-semibold text-fg">
                      {getShoeDisplaySize(v.size, v.products)}
                    </span>
                  </td>
                  <td class="td">
                    <span class="font-mono text-xs font-semibold {cur >= item.qty ? 'text-ok' : 'text-bad'}">
                      {cur} prs
                    </span>
                  </td>
                  <td class="td">
                    <div class="inline-flex items-center gap-1">
                      <button
                        type="button"
                        class="btn size-7 p-0"
                        aria-label="Decrease quantity"
                        onclick={() => changeQty(idx, -1)}
                      >
                        <Minus class="size-3" />
                      </button>
                      <input
                        class="input h-7 w-12 px-1 py-0 text-center font-mono text-xs font-semibold"
                        type="number"
                        min="1"
                        value={item.qty}
                        aria-label="Quantity"
                        onchange={(e) => setQty(idx, e.currentTarget.value)}
                      />
                      <button
                        type="button"
                        class="btn size-7 p-0"
                        aria-label="Increase quantity"
                        onclick={() => changeQty(idx, 1)}
                      >
                        <Plus class="size-3" />
                      </button>
                    </div>
                  </td>
                  <td class="td text-right font-mono text-xs text-muted">
                    {fmtMoney(Number(v.selling_price || 0) * item.qty)}
                  </td>
                  <td class="td text-center">
                    <button
                      type="button"
                      class="rounded p-1 text-dim transition hover:bg-raised hover:text-bad"
                      aria-label="Remove style from batch"
                      onclick={() => removeLine(idx)}
                    >
                      <X class="size-3.5" />
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <!-- Compact Dispatch Controls Footer -->
      <div class="mt-auto space-y-3 border-t border-line bg-raised/25 p-4 sm:px-5">
        <div class="grid gap-3 sm:grid-cols-2">
          <!-- Segmented Workflow Mode -->
          <div>
            <span class="label">Workflow Mode</span>
            <div class="grid grid-cols-2 gap-1 rounded-lg border border-line bg-raised p-1">
              <button
                type="button"
                class="cursor-pointer rounded-md py-1.5 px-2 text-xs font-medium transition {mode === 'received' ? 'bg-surface text-fg font-semibold shadow-xs ring-1 ring-line' : 'text-muted hover:text-fg'}"
                onclick={() => (mode = 'received')}
              >
                Instant Transfer
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-md py-1.5 px-2 text-xs font-medium transition {mode === 'dispatched' ? 'bg-surface text-fg font-semibold shadow-xs ring-1 ring-line' : 'text-muted hover:text-fg'}"
                onclick={() => (mode = 'dispatched')}
              >
                Waybill Dispatch
              </button>
            </div>
            <p class="mt-1 text-[11px] text-dim">
              {mode === 'received'
                ? 'Updates stock in both branches immediately (Status: Received).'
                : 'Deducts sender stock now; receiver confirms later (Status: In-Transit).'}
            </p>
          </div>

          <!-- Dispatch Notes -->
          <div>
            <label for="transfer-notes" class="label">Dispatch Notes / Driver / Vehicle (Optional)</label>
            <input
              id="transfer-notes"
              class="input h-9 text-xs"
              type="text"
              bind:value={notes}
              placeholder="e.g. Delivery Van #WP-KD-5432 · Driver Amal"
            />
          </div>
        </div>

        <button
          type="button"
          class="btn btn-primary h-10 w-full text-xs tracking-wide"
          onclick={confirmAndDispatch}
          disabled={busy || app.cart.length === 0}
        >
          {#if busy}
            <Loader2 class="size-4 animate-spin" />
            <span>Processing Transfer...</span>
          {:else}
            <Send class="size-3.5" />
            <span>
              Confirm &amp; Dispatch Transfer
              {#if totalPairs > 0}({totalPairs} Pairs · {fmtMoney(totalValue)}){/if}
            </span>
          {/if}
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
    class="btn btn-primary fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full px-5 py-2.5 shadow-xl lg:hidden"
    onclick={() => cartSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
  >
    <Layers class="size-3.5" />
    <span>View Batch · {totalPairs} prs</span>
  </button>
{/if}

{#if voucher}
  <Voucher details={voucher} success onclose={closeVoucher} />
{/if}

{#if cameraOpen}
  <CameraScanner onscan={handleScanInput} onclose={() => (cameraOpen = false)} />
{/if}
