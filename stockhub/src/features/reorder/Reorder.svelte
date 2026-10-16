<script lang="ts">
  import { onMount } from 'svelte';
  import {
    PackageSearch, Search, X, Plus, Minus, ArrowLeftRight, Check, Share2,
    FileDown, Printer, Copy, RotateCcw, Sparkles, Trash2, MapPin
  } from 'lucide-svelte';
  import { app, fmtMoney } from '../../lib/app.svelte';
  import { reorder } from './store.svelte';
  import { countOptions, getMatchingModels } from './logic';
  import AddSizeModal from './AddSizeModal.svelte';
  import PrintStockModal from './PrintStockModal.svelte';

  let activeAddSizeProductId = $state<string | null>(null);
  let printModalOpen = $state(false);
  let mobilePane = $state<'catalog' | 'sheet'>('catalog');
  let sheetSection: HTMLElement | undefined = $state();

  onMount(() => {
    reorder.resolveLocation();
  });

  const brands = $derived(countOptions('brand'));
  const cats = $derived(countOptions('category'));

  const statusOptions = [
    { id: 'ALL', label: 'All Stock Levels (සියල්ල)' },
    { id: 'LOW_STOCK', label: 'Low Stock Only (Stock <= 2)' },
    { id: 'OUT_OF_STOCK', label: 'Out of Stock Only (Stock = 0)' },
    { id: 'IN_STOCK', label: 'Well Stocked (Stock >= 3)' }
  ];

  const matched = $derived.by(() => {
    app.syncVersion;
    reorder.resolveLocation();
    return getMatchingModels({
      locId: reorder.locId,
      brand: reorder.brand,
      cat: reorder.cat,
      status: reorder.status,
      query: reorder.query
    });
  });

  const models = $derived(matched.matchingModels);
  const needsReorder = $derived(matched.needsOrderCount);

  const sheetPairs = $derived(
    reorder.sheet.reduce((sum, it) => sum + it.variants.reduce((s, v) => s + (v.orderQty || 0), 0), 0)
  );

  const sheetCost = $derived(
    reorder.sheet.reduce(
      (sum, it) => sum + it.variants.reduce((s, v) => s + (v.orderQty || 0) * (v.costPrice || it.costPrice || 0), 0),
      0
    )
  );
</script>

<div class="space-y-4">
  <!-- Top Control & Filter Bar -->
  <div class="card p-4 sm:p-5">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="font-display text-base font-bold tracking-tight text-fg sm:text-lg">
            Footwear Stock Matrix &amp; Smart Reorder Hub
          </h1>
          <span class="chip font-mono">{models.length} Styles</span>
          <span class="chip font-mono {needsReorder > 0 ? 'text-warn' : 'text-muted'}">
            0-Stock Sizes: {needsReorder}
          </span>
        </div>
        <p class="mt-0.5 text-xs text-dim">
          Live branch stock by Brand, Category &amp; Article Code · Select models to build Supplier Purchase Orders or transfer stock
        </p>
      </div>

      <!-- Export & Print Actions -->
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="btn btn-sm"
          onclick={() => reorder.exportStockCSV()}
          title="Export Live Stock Breakdown to CSV / Excel"
        >
          <FileDown class="h-3.5 w-3.5 text-muted" />
          <span>Stock CSV</span>
        </button>

        <button
          type="button"
          class="btn btn-sm"
          onclick={() => (printModalOpen = true)}
          title="Print Live Stock Inventory Sheet"
        >
          <Printer class="h-3.5 w-3.5 text-muted" />
          <span>Print Stock</span>
        </button>

        <button
          type="button"
          class="btn btn-sm"
          onclick={() => reorder.copyStockWhatsApp()}
          title="Copy Current Stock summary for WhatsApp"
        >
          <Share2 class="h-3.5 w-3.5 text-muted" />
          <span>WhatsApp Summary</span>
        </button>
      </div>
    </div>

    <!-- Filters Row -->
    <div class="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label class="label" for="reorderBranchSelect">Branch / Location</label>
        <div class="relative">
          <MapPin class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
          <select
            id="reorderBranchSelect"
            class="input h-9 pl-8 text-xs"
            value={reorder.locId}
            onchange={(e) => reorder.setLocation((e.target as HTMLSelectElement).value)}
          >
            <option value="ALL">All Branches Combined (සියලු ශාඛා)</option>
            {#each app.locations as loc (loc.id)}
              <option value={loc.id}>{loc.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <div>
        <label class="label" for="reorderBrandSelect">Brand (වර්ගය)</label>
        <select
          id="reorderBrandSelect"
          class="input h-9 text-xs"
          bind:value={reorder.brand}
        >
          <option value="ALL">All Brands (සියලු Brands)</option>
          {#each brands as b (b.value)}
            <option value={b.value}>{b.value} ({b.count})</option>
          {/each}
        </select>
      </div>

      <div>
        <label class="label" for="reorderCatSelect">Category (කාණ්ඩය)</label>
        <select
          id="reorderCatSelect"
          class="input h-9 text-xs"
          bind:value={reorder.cat}
        >
          <option value="ALL">All Categories (සියලු කාණ්ඩ)</option>
          {#each cats as c (c.value)}
            <option value={c.value}>{c.value} ({c.count})</option>
          {/each}
        </select>
      </div>

      <div>
        <label class="label" for="reorderStatusSelect">Stock Status</label>
        <select
          id="reorderStatusSelect"
          class="input h-9 text-xs"
          bind:value={reorder.status}
        >
          {#each statusOptions as opt (opt.id)}
            <option value={opt.id}>{opt.label}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- Search input -->
    <div class="relative mt-2.5">
      <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
      <input
        type="text"
        class="input h-9 pl-9 pr-9 text-xs"
        placeholder="Search by Shoe Code, Article #, Brand, or Size (e.g. SFW006, AS8006, 032-16, RD015)..."
        bind:value={reorder.query}
      />
      {#if reorder.query}
        <button
          type="button"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-dim hover:text-fg"
          onclick={() => (reorder.query = '')}
          aria-label="Clear search"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      {/if}
    </div>
  </div>

  <!-- Mobile / Tablet View Switcher (< lg) -->
  <div class="sticky top-14 z-30 -mx-4 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur lg:hidden">
    <div class="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface p-1">
      <button
        type="button"
        class="cursor-pointer rounded-md py-1.5 px-2 text-xs font-medium transition {mobilePane === 'catalog' ? 'bg-fg text-bg font-semibold shadow-xs' : 'text-muted hover:text-fg'}"
        onclick={() => (mobilePane = 'catalog')}
      >
        Shoe Catalog ({models.length})
      </button>
      <button
        type="button"
        class="cursor-pointer rounded-md py-1.5 px-2 text-xs font-medium transition {mobilePane === 'sheet' ? 'bg-fg text-bg font-semibold shadow-xs' : 'text-muted hover:text-fg'}"
        onclick={() => (mobilePane = 'sheet')}
      >
        Reorder Sheet ({reorder.sheet.length} · {sheetPairs} prs)
      </button>
    </div>
  </div>

  <!-- Workspace 2-Column Grid -->
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
    <!-- Left Column: Shoe Models Catalog (7 cols on lg) -->
    <div class="min-w-0 space-y-3 lg:col-span-7 {mobilePane === 'sheet' ? 'hidden lg:block' : ''}">
      <div class="flex items-center justify-between px-1">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">
          Shoe Models &amp; Size Matrix
        </h2>
        <span class="font-mono text-[11px] text-dim">
          Showing {models.length} of {app.productsMap.size} models
        </span>
      </div>

      {#if models.length === 0}
        <div class="card p-10 text-center">
          <PackageSearch class="mx-auto mb-2 h-8 w-8 text-dim" />
          <p class="text-xs font-medium text-fg">No shoe models match your current filters</p>
          <p class="mt-1 text-[11px] text-dim">Try clearing the search query or switching the branch/status filter.</p>
        </div>
      {:else}
        <div class="space-y-2.5">
          {#each models as m (m.productId)}
            {@const inSheet = reorder.has(m.productId)}
            <div
              class="card p-3.5 sm:p-4 transition-colors duration-150 {inSheet ? 'border-fg/40 bg-raised/40' : 'hover:border-fg/20'}"
            >
              <div class="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="chip text-[10px] font-semibold uppercase text-fg">{m.brand || 'GENERIC'}</span>
                    <span class="text-[11px] text-dim">{m.category}</span>
                    {#if m.gender}
                      <span class="text-[11px] text-dim">· {m.gender}</span>
                    {/if}
                  </div>
                  <h3 class="mt-1 truncate font-display text-sm font-bold text-fg sm:text-base">
                    {m.name}
                  </h3>
                  <div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                    <span>Retail: <strong class="font-mono text-fg">{fmtMoney(m.sellingPrice)}</strong></span>
                    {#if m.costPrice}
                      <span class="text-dim">· Cost: <span class="font-mono">{fmtMoney(m.costPrice)}</span></span>
                    {/if}
                    <span class="text-dim">· Stock: <strong class="font-mono text-fg">{m.totalStock} prs</strong></span>
                  </div>
                </div>

                <!-- Card action buttons -->
                <div class="grid grid-cols-2 gap-1.5 sm:flex sm:items-center sm:shrink-0">
                  <button
                    type="button"
                    class="btn btn-sm {inSheet ? 'btn-primary' : ''}"
                    onclick={() => reorder.toggleCode(m.productId)}
                  >
                    {#if inSheet}
                      <Check class="h-3.5 w-3.5" />
                      <span>In Sheet</span>
                    {:else}
                      <Plus class="h-3.5 w-3.5" />
                      <span>Reorder</span>
                    {/if}
                  </button>

                  <button
                    type="button"
                    class="btn btn-sm text-muted hover:text-fg"
                    onclick={() => reorder.sendToTransfer(m.productId)}
                    title="Send available stock of this model to Transfer Batch"
                  >
                    <ArrowLeftRight class="h-3.5 w-3.5 text-dim" />
                    <span>Transfer ({m.totalStock})</span>
                  </button>
                </div>
              </div>

              <!-- Size Matrix Badges -->
              <div class="mt-3 flex flex-wrap gap-1.5">
                {#each m.variants as v (v.id)}
                  {@const isZero = v.stock === 0}
                  {@const isLow = v.stock > 0 && v.stock <= 2}
                  <div
                    class="flex min-w-[46px] flex-col items-center rounded-md border px-2 py-1 text-center
                      {isZero
                        ? 'border-bad/25 bg-bad/5'
                        : 'border-line bg-raised/60'}"
                  >
                    <span class="text-[10px] font-medium text-dim">Sz {v.displaySize}</span>
                    <strong
                      class="font-mono text-xs {isZero ? 'text-bad' : isLow ? 'text-warn' : 'text-fg'}"
                    >
                      {v.stock}
                    </strong>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Right Column: Sticky Reorder Sheet (5 cols on lg) -->
    <div
      bind:this={sheetSection}
      class="min-w-0 space-y-3 lg:col-span-5 lg:sticky lg:top-18 {mobilePane === 'catalog' ? 'hidden lg:block' : ''}"
    >
      <div class="flex items-center justify-between px-1">
        <div class="flex items-center gap-2">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">
            Supplier Reorder Sheet
          </h2>
          <span class="chip font-mono">{reorder.sheet.length} Models · {sheetPairs} Pairs</span>
        </div>

        {#if reorder.sheet.length > 0}
          <button
            type="button"
            class="btn btn-sm btn-ghost h-7 px-2 text-xs text-dim hover:text-bad"
            onclick={() => reorder.clearSheet()}
            title="Clear all models from sheet"
          >
            <Trash2 class="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>
        {/if}
      </div>

      {#if reorder.sheet.length === 0}
        <div class="card p-8 text-center">
          <PackageSearch class="mx-auto mb-2 h-8 w-8 text-dim" />
          <h3 class="text-xs font-semibold text-fg">Reorder Sheet is Empty</h3>
          <p class="mt-1 text-[11px] text-dim">
            Click <strong class="text-muted">+ Reorder</strong> on any shoe model to add sizes and quantities.
          </p>
          <button
            type="button"
            class="btn btn-sm mt-3 lg:hidden"
            onclick={() => (mobilePane = 'catalog')}
          >
            Browse Shoe Catalog
          </button>
        </div>
      {:else}
        <div class="space-y-2.5">
          {#each reorder.sheet as it (it.productId)}
            {@const modelTotal = it.variants.reduce((s, v) => s + (v.orderQty || 0), 0)}
            <div id={`sheetItem_${it.productId}`} class="card p-3.5">
              <div class="flex items-start justify-between gap-2 border-b border-line pb-2.5">
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="chip text-[10px] font-semibold uppercase text-fg">{it.brand || 'GENERIC'}</span>
                    <span class="text-[11px] text-dim">{it.category}</span>
                  </div>
                  <h4 class="mt-0.5 truncate font-display text-sm font-bold text-fg">{it.name}</h4>
                  <div class="font-mono text-[11px] text-muted">
                    Sell: {fmtMoney(it.sellingPrice)}
                    {#if it.costPrice}
                      <span class="text-dim"> · Cost: {fmtMoney(it.costPrice)}</span>
                    {/if}
                    · Order: <strong class="text-fg">{modelTotal} prs</strong>
                  </div>
                </div>

                <button
                  type="button"
                  class="btn btn-ghost btn-sm size-7 p-0 text-dim hover:text-bad"
                  onclick={() => reorder.removeCode(it.productId)}
                  aria-label="Remove model"
                >
                  <X class="h-3.5 w-3.5" />
                </button>
              </div>

              <!-- Model Quick Tools -->
              <div class="mt-2 flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  class="chip cursor-pointer hover:border-fg/40 hover:text-fg"
                  onclick={() => (activeAddSizeProductId = it.productId)}
                >
                  <Plus class="h-3 w-3" />
                  <span>Add Size</span>
                </button>

                <button
                  type="button"
                  class="chip cursor-pointer hover:border-fg/40 hover:text-fg"
                  onclick={() => reorder.fillZeroStock(it.productId, 3)}
                  title="Set 3 pairs for all 0-stock sizes"
                >
                  <Sparkles class="h-3 w-3" />
                  <span>0-Stock (3)</span>
                </button>

                <button
                  type="button"
                  class="chip cursor-pointer hover:border-fg/40 hover:text-fg"
                  onclick={() => reorder.fillCurrentStock(it.productId)}
                  title="Match current stock quantities"
                >
                  <span>Match Stock</span>
                </button>

                <button
                  type="button"
                  class="chip cursor-pointer hover:border-fg/40 hover:text-fg"
                  onclick={() => reorder.addOneAll(it.productId)}
                  title="Add +1 to all sizes"
                >
                  <span>+1 All</span>
                </button>

                <button
                  type="button"
                  class="chip cursor-pointer hover:border-bad/50 hover:text-bad"
                  onclick={() => reorder.zeroAll(it.productId)}
                  title="Reset all quantities to 0"
                >
                  <RotateCcw class="h-3 w-3" />
                  <span>Zero</span>
                </button>
              </div>

              <!-- Sizes Table -->
              <div class="mt-2.5 overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="border-b border-line text-[10px] uppercase tracking-wider text-dim">
                      <th class="py-1.5 text-left font-semibold">Size</th>
                      <th class="py-1.5 text-center font-semibold">Stock</th>
                      <th class="py-1.5 text-right font-semibold">Order Qty</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-line/50">
                    {#each it.variants as v (v.variantId)}
                      <tr>
                        <td class="py-1.5 font-medium text-fg">
                          Sz {v.displaySize || v.size}
                          {#if v.isCustom}
                            <span class="ml-1 rounded border border-line bg-raised px-1 py-0.5 text-[9px] text-muted">Custom</span>
                          {/if}
                        </td>
                        <td class="py-1.5 text-center font-mono {v.currentStock === 0 ? 'text-bad font-semibold' : 'text-muted'}">
                          {v.currentStock}
                        </td>
                        <td class="py-1.5 text-right">
                          <div class="inline-flex items-center gap-1">
                            <button
                              type="button"
                              class="grid h-8 w-8 sm:h-6 sm:w-6 cursor-pointer place-items-center rounded border border-line bg-raised text-muted hover:border-fg/40 hover:text-fg"
                              onclick={() => reorder.stepQty(it.productId, v.variantId, -1)}
                              aria-label="Decrease quantity"
                            >
                              <Minus class="h-3 w-3" />
                            </button>
                            <input
                              type="number"
                              inputmode="numeric"
                              min="0"
                              class="input h-8 w-12 sm:h-6 p-0 text-center font-mono text-xs font-semibold"
                              value={v.orderQty}
                              oninput={(e) => reorder.setQty(it.productId, v.variantId, (e.target as HTMLInputElement).value)}
                            />
                            <button
                              type="button"
                              class="grid h-8 w-8 sm:h-6 sm:w-6 cursor-pointer place-items-center rounded border border-line bg-raised text-muted hover:border-fg/40 hover:text-fg"
                              onclick={() => reorder.stepQty(it.productId, v.variantId, 1)}
                              aria-label="Increase quantity"
                            >
                              <Plus class="h-3 w-3" />
                            </button>
                            {#if v.isCustom}
                              <button
                                type="button"
                                class="ml-0.5 cursor-pointer p-1 text-dim hover:text-bad"
                                onclick={() => reorder.removeCustomSize(it.productId, v.variantId)}
                                title="Remove custom size"
                              >
                                <X class="h-3 w-3" />
                              </button>
                            {/if}
                          </div>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/each}
        </div>

        <!-- Order Notes & Export Card -->
        <div class="card p-3.5 space-y-3">
          <div>
            <label class="label" for="reorderNotesArea">Supplier Order Notes (සටහන්)</label>
            <textarea
              id="reorderNotesArea"
              class="input min-h-[54px] resize-y text-xs"
              placeholder="e.g. Urgent delivery needed by Friday; please confirm packing."
              bind:value={reorder.notes}
            ></textarea>
          </div>

          <!-- Totals -->
          <div class="rounded-lg border border-line bg-raised/60 p-2.5 text-xs space-y-1">
            <div class="flex justify-between text-muted">
              <span>Total Shoe Styles:</span>
              <strong class="font-mono text-fg">{reorder.sheet.length} Styles</strong>
            </div>
            <div class="flex justify-between text-muted">
              <span>Total Order Quantity:</span>
              <strong class="font-mono text-fg text-sm">{sheetPairs} Pairs</strong>
            </div>
            {#if sheetCost > 0}
              <div class="flex justify-between text-muted">
                <span>Est. Wholesale Cost:</span>
                <strong class="font-mono text-fg">{fmtMoney(sheetCost)}</strong>
              </div>
            {/if}
          </div>

          <!-- Action buttons -->
          <div class="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              class="btn btn-primary h-9"
              onclick={() => reorder.copyWhatsAppOrder()}
            >
              <Copy class="h-3.5 w-3.5" />
              <span>Copy WhatsApp</span>
            </button>

            <button
              type="button"
              class="btn h-9"
              onclick={() => reorder.directWhatsAppOrder()}
            >
              <Share2 class="h-3.5 w-3.5" />
              <span>Open WhatsApp</span>
            </button>

            <button
              type="button"
              class="btn h-9"
              onclick={() => reorder.printPO()}
            >
              <Printer class="h-3.5 w-3.5" />
              <span>Print PO Slip</span>
            </button>

            <button
              type="button"
              class="btn h-9"
              onclick={() => reorder.exportCSV()}
            >
              <FileDown class="h-3.5 w-3.5" />
              <span>CSV / Excel</span>
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Mobile floating button to switch to Reorder Sheet -->
{#if mobilePane === 'catalog' && reorder.sheet.length > 0}
  <button
    type="button"
    class="btn btn-primary fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full px-5 py-2.5 shadow-xl lg:hidden"
    onclick={() => {
      mobilePane = 'sheet';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }}
  >
    <Check class="h-3.5 w-3.5" />
    <span>Reorder Sheet · {reorder.sheet.length} Models ({sheetPairs} prs)</span>
  </button>
{/if}

<!-- Modal Overlays -->
{#if activeAddSizeProductId}
  <AddSizeModal
    productId={activeAddSizeProductId}
    onclose={() => (activeAddSizeProductId = null)}
  />
{/if}

{#if printModalOpen}
  <PrintStockModal
    onclose={() => (printModalOpen = false)}
  />
{/if}
