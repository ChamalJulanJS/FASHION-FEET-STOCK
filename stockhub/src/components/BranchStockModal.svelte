<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Store, Search, X, Camera, ArrowLeftRight, Check, PackageSearch, Plus,
    MapPin, Sparkles, AlertCircle
  } from 'lucide-svelte';
  import { app, getShoeDisplaySize, fmtMoney } from '../lib/app.svelte';
  import { extractBaseSkuAndSize } from '../features/stockcount/logic';
  import CameraScanner from '../features/transfer/CameraScanner.svelte';
  import type { Variant } from '../lib/types';
  import { reorder } from '../features/reorder/store.svelte';

  let query = $state('');
  let cameraOpen = $state(false);
  let searchInput: HTMLInputElement | undefined = $state();

  onMount(() => {
    searchInput?.focus();
  });

  function close() {
    app.branchStockModalOpen = false;
  }

  function handleScan(raw: string) {
    if (!raw) return;
    cameraOpen = false;
    const trimmed = raw.trim();
    // 1. Exact variant
    const exact = app.catalog.find(
      (v) => (v.barcode && v.barcode.toUpperCase() === trimmed.toUpperCase()) || (v.sku && v.sku.toUpperCase() === trimmed.toUpperCase())
    );
    if (exact) {
      query = exact.products?.name || exact.sku;
      return;
    }
    // 2. Base SKU
    const { baseSku } = extractBaseSkuAndSize(trimmed);
    query = baseSku || trimmed;
  }

  interface BranchGroupStock {
    locationId: string;
    locationName: string;
    totalPairs: number;
    sizes: { size: string; displaySize: string; stock: number }[];
  }

  interface MatchedModelGroup {
    productId: string;
    name: string;
    brand: string;
    category: string;
    sellingPrice: number;
    totalCombinedPairs: number;
    branches: BranchGroupStock[];
    allSizes: { size: string; displaySize: string; totalStock: number }[];
  }

  const matchingModels = $derived.by<MatchedModelGroup[]>(() => {
    app.syncVersion;
    const q = query.trim().toUpperCase();
    if (!q || q.length < 1) return [];

    const { baseSku } = extractBaseSkuAndSize(q);
    const b = (baseSku || '').trim().toUpperCase();

    const results: MatchedModelGroup[] = [];

    for (const [productId, variants] of app.productsMap.entries()) {
      if (!variants || variants.length === 0) continue;
      const p = variants[0].products || {};
      const pName = (p.name || variants[0].sku || '').toUpperCase();
      const pBrand = (p.brand || '').toUpperCase();
      const pCat = (p.category || '').toUpperCase();

      const matchName = pName.includes(q) || (b.length >= 2 && pName.includes(b));
      const matchBrand = pBrand.includes(q);
      const matchCat = pCat.includes(q);
      const matchSku = variants.some(
        (v) => (v.sku && v.sku.toUpperCase().includes(q)) || (v.barcode && v.barcode.toUpperCase() === q) || (b.length >= 2 && v.sku && v.sku.toUpperCase().includes(b))
      );
      const matchSize = variants.some((v) => {
        const raw = (v.size || '').toUpperCase();
        const disp = getShoeDisplaySize(v.size, p).toUpperCase();
        return raw === q || disp === q;
      });

      if (!matchName && !matchBrand && !matchCat && !matchSku && !matchSize) continue;

      // Group by branch
      let totalCombined = 0;
      const branches: BranchGroupStock[] = app.locations.map((loc) => {
        let locTotal = 0;
        const sizes: { size: string; displaySize: string; stock: number }[] = [];
        for (const v of variants) {
          const s = app.stockMap.get(`${v.id}_${loc.id}`) || 0;
          locTotal += s;
          if (s > 0) {
            sizes.push({
              size: v.size || '',
              displaySize: getShoeDisplaySize(v.size, p),
              stock: s,
            });
          }
        }
        sizes.sort((x, y) => {
          const nx = parseFloat(x.size);
          const ny = parseFloat(y.size);
          if (!isNaN(nx) && !isNaN(ny)) return nx - ny;
          return x.size.localeCompare(y.size);
        });
        totalCombined += locTotal;
        return {
          locationId: loc.id,
          locationName: loc.name,
          totalPairs: locTotal,
          sizes,
        };
      });

      // Overall sizes
      const allSizesMap = new Map<string, { size: string; displaySize: string; totalStock: number }>();
      for (const v of variants) {
        const sz = v.size || '';
        let tot = 0;
        for (const loc of app.locations) tot += app.stockMap.get(`${v.id}_${loc.id}`) || 0;
        if (!allSizesMap.has(sz)) {
          allSizesMap.set(sz, { size: sz, displaySize: getShoeDisplaySize(sz, p), totalStock: tot });
        } else {
          allSizesMap.get(sz)!.totalStock += tot;
        }
      }
      const allSizes = Array.from(allSizesMap.values()).sort((x, y) => {
        const nx = parseFloat(x.size);
        const ny = parseFloat(y.size);
        if (!isNaN(nx) && !isNaN(ny)) return nx - ny;
        return x.size.localeCompare(y.size);
      });

      results.push({
        productId,
        name: p.name || variants[0].sku || 'Shoe Model',
        brand: p.brand || 'Generic',
        category: p.category || 'Footwear',
        sellingPrice: Number(variants[0].selling_price) || 0,
        totalCombinedPairs: totalCombined,
        branches,
        allSizes,
      });

      if (results.length >= 20) break;
    }

    return results;
  });

  function transferFrom(productId: string, fromLocId: string) {
    reorder.sendToTransfer(productId, fromLocId);
    close();
  }

  function openInReorder(shoeName: string) {
    app.tab = 'reorder';
    reorder.query = shoeName;
    close();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-5">
  <div
    class="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    role="dialog"
    aria-modal="true"
    aria-label="Branch Stock Checker"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-line bg-raised/70 px-4 py-3 sm:px-5">
      <div class="flex items-center gap-2">
        <div class="grid h-8 w-8 place-items-center rounded-lg bg-ok/15 text-ok border border-ok/30">
          <Store class="h-4 w-4" />
        </div>
        <div>
          <h2 class="font-display text-sm font-bold text-fg sm:text-base">
            Live Branch Stock Checker (ශාඛා තොග පරීක්ෂාව)
          </h2>
          <p class="text-[11px] text-muted">
            Scan barcode or enter shoe code to see stock across all branches
          </p>
        </div>
      </div>
      <button
        type="button"
        class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-dim transition hover:bg-surface hover:text-fg"
        onclick={close}
        aria-label="Close"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- Search Box -->
    <div class="border-b border-line bg-surface p-3 sm:p-4">
      <div class="relative">
        <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
        <input
          bind:this={searchInput}
          type="text"
          class="input h-11 pl-10 pr-24 text-sm font-medium"
          placeholder="Scan barcode or type Shoe Code (e.g. SFW006, RD015, SL105)..."
          bind:value={query}
        />
        <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {#if query}
            <button
              type="button"
              class="grid h-7 w-7 cursor-pointer place-items-center rounded text-dim hover:text-fg"
              onclick={() => (query = '')}
              aria-label="Clear"
            >
              <X class="h-4 w-4" />
            </button>
          {/if}
          <button
            type="button"
            class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-semibold text-fg shadow-xs transition hover:bg-raised hover:border-fg/40"
            onclick={() => (cameraOpen = true)}
            title="Scan barcode with camera"
          >
            <Camera class="h-4 w-4 text-ok" />
            <span>Scan</span>
          </button>
        </div>
      </div>

      <!-- Quick Tips -->
      <div class="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-dim">
        <span>💡 Enter shoe code or scan box barcode to check which branch has pairs.</span>
        {#if app.locations.length > 0}
          <span class="font-mono text-muted">Tracking: {app.locations.map(l => l.name).join(' · ')}</span>
        {/if}
      </div>
    </div>

    <!-- Results Body -->
    <div class="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
      {#if !query}
        <div class="p-8 text-center sm:p-12">
          <PackageSearch class="mx-auto mb-3 h-10 w-10 text-dim" />
          <h3 class="text-sm font-semibold text-fg">Ready to Check Branch Inventory</h3>
          <p class="mt-1 text-xs text-muted max-w-md mx-auto">
            Scan any barcode with your phone camera or type the shoe code (e.g. SFW006, 032-16) above to see real-time availability in Shoe Gallery, FF Branch, and Head Office.
          </p>
          <div class="mt-4 flex justify-center">
            <button
              type="button"
              class="btn btn-primary"
              onclick={() => (cameraOpen = true)}
            >
              <Camera class="h-4 w-4" />
              <span>Open Camera Scanner</span>
            </button>
          </div>
        </div>
      {:else if matchingModels.length === 0}
        <div class="card p-8 text-center">
          <AlertCircle class="mx-auto mb-2 h-8 w-8 text-warn" />
          <p class="text-sm font-bold text-fg">No shoe models found for "{query}"</p>
          <p class="mt-1 text-xs text-dim">
            Double-check the shoe code or try scanning the box barcode directly.
          </p>
        </div>
      {:else}
        {#each matchingModels as m (m.productId)}
          <div class="card p-4 space-y-3.5 border-line shadow-xs">
            <!-- Model Header -->
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between border-b border-line/60 pb-3">
              <div>
                <div class="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-dim">
                  <span class="chip py-0 text-[10px] text-fg font-bold">{m.brand}</span>
                  <span>•</span>
                  <span>{m.category}</span>
                </div>
                <h3 class="mt-1 font-display text-base font-bold text-fg sm:text-lg">
                  {m.name}
                </h3>
                <div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>Retail Price: <strong class="font-mono text-fg">{fmtMoney(m.sellingPrice)}</strong></span>
                  <span>•</span>
                  <span>Total Combined Stock: <strong class="font-mono text-fg {m.totalCombinedPairs > 0 ? 'text-ok font-bold' : 'text-bad'}">{m.totalCombinedPairs} pairs</strong></span>
                </div>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  class="btn btn-sm"
                  onclick={() => openInReorder(m.name)}
                  title="View in Stock & Reorder sheet"
                >
                  <Plus class="h-3.5 w-3.5" />
                  <span>Reorder</span>
                </button>
              </div>
            </div>

            <!-- Branch Stock Grid (Which branch has stock?) -->
            <div>
              <div class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-dim">
                Stock Breakdown by Branch (ශාඛා තොග තොරතුරු)
              </div>
              <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {#each m.branches as b (b.locationId)}
                  {@const has = b.totalPairs > 0}
                  <div class="flex flex-col justify-between rounded-xl border p-3 {has ? 'border-ok/30 bg-raised/50' : 'border-line/40 bg-surface/50 opacity-70'}">
                    <div>
                      <div class="flex items-center justify-between gap-1">
                        <span class="truncate text-xs font-bold text-fg">{b.locationName}</span>
                        <span class="chip font-mono text-xs font-bold py-0.5 px-2 {has ? 'border-ok/40 bg-ok/10 text-ok' : 'border-bad/30 bg-bad/10 text-bad'}">
                          {b.totalPairs} prs
                        </span>
                      </div>

                      {#if has && b.sizes.length > 0}
                        <div class="mt-2.5 flex flex-wrap gap-1">
                          {#each b.sizes as sz}
                            <span class="chip py-0.5 px-1.5 text-[10px] font-mono bg-surface">
                              Sz {sz.displaySize}: <strong class="text-fg">{sz.stock}</strong>
                            </span>
                          {/each}
                        </div>
                      {:else}
                        <div class="mt-2 text-xs text-dim italic">
                          No stock at this location
                        </div>
                      {/if}
                    </div>

                    {#if has}
                      <div class="mt-3 pt-2 border-t border-line/40 flex justify-end">
                        <button
                          type="button"
                          class="cursor-pointer text-xs font-semibold text-fg hover:text-ok inline-flex items-center gap-1 transition"
                          onclick={() => transferFrom(m.productId, b.locationId)}
                          title="Transfer stock from {b.locationName}"
                        >
                          <ArrowLeftRight class="h-3.5 w-3.5 text-ok" />
                          <span>Transfer from here</span>
                        </button>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>

            <!-- Size Matrix Summary -->
            <div class="rounded-lg bg-raised/30 p-2.5 border border-line/40">
              <div class="text-[10px] font-semibold uppercase text-dim mb-1">
                All Sizes Combined Stock:
              </div>
              <div class="flex flex-wrap gap-1">
                {#each m.allSizes as sz}
                  {@const isZero = sz.totalStock === 0}
                  <span class="chip text-[10px] font-mono {isZero ? 'border-bad/30 bg-bad/5 text-bad' : 'bg-surface text-fg'}">
                    Sz {sz.displaySize}: <strong>{sz.totalStock}</strong>
                  </span>
                {/each}
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between border-t border-line bg-raised/50 px-4 py-2.5 text-xs text-muted">
      <span>Press <kbd class="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-mono">Esc</kbd> to close</span>
      <button
        type="button"
        class="btn btn-sm"
        onclick={close}
      >
        Done
      </button>
    </div>
  </div>
</div>

{#if cameraOpen}
  <CameraScanner onscan={handleScan} onclose={() => (cameraOpen = false)} />
{/if}
