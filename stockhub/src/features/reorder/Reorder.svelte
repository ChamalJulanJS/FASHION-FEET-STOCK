<script lang="ts">
  import { onMount } from 'svelte';
  import {
    PackageSearch, Search, X, Plus, Minus, ArrowLeftRight, Check, Share2,
    FileDown, Printer, Copy, RotateCcw, AlertCircle, Sparkles, Trash2, MapPin
  } from 'lucide-svelte';
  import { app, fmtMoney } from '../../lib/app.svelte';
  import { reorder } from './store.svelte';
  import { countOptions, getMatchingModels } from './logic';
  import AddSizeModal from './AddSizeModal.svelte';
  import PrintStockModal from './PrintStockModal.svelte';

  let activeAddSizeProductId = $state<string | null>(null);
  let printModalOpen = $state(false);

  onMount(() => {
    reorder.resolveLocation();
  });

  const brands = $derived(countOptions('brand'));
  const cats = $derived(countOptions('category'));

  const statusOptions = [
    { id: 'ALL', label: 'All Stock Levels (සියල්ල)' },
    { id: 'LOW_STOCK', label: 'Low Stock Only (Stock <= 2)' },
    { id: 'ZERO_STOCK', label: 'Out of Stock Only (Stock = 0)' },
    { id: 'IN_STOCK', label: 'In Stock Only (Stock > 0)' }
  ];

  const matched = $derived.by(() => {
    // Touch reactive properties
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
  const needsReorder = $derived(models.filter((m) => m.hasZeroStock || m.hasLowStock).length);

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

<div class="space-y-5">
  <!-- Top Banner / Control Panel -->
  <div class="card p-5">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div class="mb-1 flex items-center gap-2">
          <span class="chip">STOCK &amp; REORDER MATRIX</span>
          <span class="chip font-mono">{models.length} Styles</span>
          <span class="chip text-warn font-mono">Needs Reorder: {needsReorder}</span>
        </div>
        <h1 class="font-display text-xl font-bold tracking-tight text-fg">
          Footwear Stock Matrix &amp; Smart Reorder Hub
        </h1>
        <p class="text-xs text-muted">
          Check live branch stock by Brand, Category &amp; Article Code • Select codes to drop into Supplier Reorder Form
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-wrap items-center gap-2">
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
          <span>WhatsApp</span>
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
            class="input pl-8"
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
          class="input"
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
          class="input"
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
          class="input"
          bind:value={reorder.status}
        >
          {#each statusOptions as opt (opt.id)}
            <option value={opt.id}>{opt.label}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- Search input -->
    <div class="relative mt-3">
      <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
      <input
        type="text"
        class="input pl-9 pr-9"
        placeholder="Search by Shoe Code, Article #, or Name (e.g. SFW006, AS8006, 032-16, RD015)..."
        bind:value={reorder.query}
      />
      {#if reorder.query}
        <button
          type="button"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 text-dim hover:text-fg"
          onclick={() => (reorder.query = '')}
          aria-label="Clear search"
        >
          <X class="h-4 w-4" />
        </button>
      {/if}
    </div>
  </div>

  <!-- Workspace 2-Column Grid -->
  <div class="grid grid-cols-1 gap-5 lg:grid-cols-12">
    <!-- Left Column: Catalog (7 cols on lg) -->
    <div class="space-y-3.5 lg:col-span-7">
      <div class="flex items-center justify-between px-1">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">
          Shoe Models &amp; Size Stock
        </h2>
        <span class="text-xs text-dim">Showing {models.length} of {app.productsMap.size} styles</span>
      </div>

      {#if models.length === 0}
        <div class="card p-10 text-center">
          <PackageSearch class="mx-auto mb-2 h-10 w-10 text-dim" />
          <p class="text-sm text-muted">No shoe models match the selected filters or search.</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each models as m (m.productId)}
            {@const inSheet = reorder.has(m.productId)}
            <div class="card p-4 transition-all duration-150 {inSheet ? 'ring-1 ring-accent/40 bg-accent-soft/10' : ''}">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="chip text-xs font-semibold">{m.brand || 'GENERIC'}</span>
                    <span class="text-xs text-dim">{m.category}</span>
                    {#if m.gender}
                      <span class="text-xs text-dim">• {m.gender}</span>
                    {/if}
                  </div>
                  <h3 class="mt-1 font-display text-base font-bold text-fg">
                    {m.name}
                  </h3>
                  <div class="mt-0.5 text-xs text-muted">
                    Sell: <strong class="text-fg">{fmtMoney(m.sellingPrice)}</strong>
                    {#if m.costPrice}
                      <span class="text-dim"> (Cost: {fmtMoney(m.costPrice)})</span>
                    {/if}
                  </div>
                </div>

                <!-- Card action buttons -->
                <div class="flex items-center gap-2 pt-1 sm:pt-0">
                  <button
                    type="button"
                    class="btn btn-sm {inSheet ? 'border-accent bg-accent text-white hover:bg-accent-hover' : 'btn-primary'}"
                    onclick={() => reorder.toggleCode(m.productId)}
                  >
                    {#if inSheet}
                      <Check class="h-3.5 w-3.5" />
                      <span>In Sheet</span>
                    {:else}
                      <Plus class="h-3.5 w-3.5" />
                      <span>Add to Reorder</span>
                    {/if}
                  </button>

                  <button
                    type="button"
                    class="btn btn-sm"
                    onclick={() => reorder.sendToTransfer(m.productId)}
                    title="Send available stock of this model to Transfer Batch"
                  >
                    <ArrowLeftRight class="h-3.5 w-3.5 text-muted" />
                    <span>Transfer ({m.totalStock})</span>
                  </button>
                </div>
              </div>

              <!-- Size Matrix Badges -->
              <div class="mt-3.5 flex flex-wrap gap-1.5">
                {#each m.variants as v (v.id)}
                  {@const isZero = v.stock === 0}
                  {@const isLow = v.stock > 0 && v.stock <= 2}
                  <div
                    class="flex flex-col items-center rounded-lg border px-2.5 py-1 text-center min-w-[48px]
                      {isZero ? 'border-bad/30 bg-bad/5 text-bad' : isLow ? 'border-warn/30 bg-warn/5 text-warn' : 'border-line bg-raised text-fg'}"
                  >
                    <span class="text-[10px] font-medium text-dim">Sz {v.displaySize}</span>
                    <strong class="font-mono text-xs {isZero ? 'text-bad' : isLow ? 'text-warn' : 'text-fg'}">
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

    <!-- Right Column: Reorder Sheet (5 cols on lg) -->
    <div class="space-y-3.5 lg:col-span-5">
      <div class="flex items-center justify-between px-1">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">
            Reorder Sheet
          </h2>
          <span class="chip font-mono">{reorder.sheet.length} Models • {sheetPairs} Pairs</span>
        </div>

        {#if reorder.sheet.length > 0}
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="btn btn-sm btn-ghost text-xs text-dim hover:text-bad"
              onclick={() => reorder.clearSheet()}
              title="Clear all models from sheet"
            >
              <Trash2 class="h-3.5 w-3.5" />
              <span>Clear</span>
            </button>
          </div>
        {/if}
      </div>

      {#if reorder.sheet.length === 0}
        <div class="card p-8 text-center">
          <PackageSearch class="mx-auto mb-2.5 h-10 w-10 text-dim" />
          <h3 class="text-sm font-semibold text-fg">Reorder Sheet is Empty</h3>
          <p class="mt-1 text-xs text-muted">
            Click <strong>"+ Add to Reorder"</strong> on any shoe model on the left to add sizes and quantities.
          </p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each reorder.sheet as it (it.productId)}
            {@const modelTotal = it.variants.reduce((s, v) => s + (v.orderQty || 0), 0)}
            <div id={`sheetItem_${it.productId}`} class="card p-4">
              <div class="flex items-start justify-between gap-2 border-b border-line pb-2.5">
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="chip text-[10px] font-semibold">{it.brand || 'GENERIC'}</span>
                    <span class="text-[11px] text-dim">{it.category}</span>
                  </div>
                  <h4 class="mt-0.5 font-display text-sm font-bold text-fg">{it.name}</h4>
                  <div class="text-[11px] text-muted">
                    Sell: {fmtMoney(it.sellingPrice)}
                    {#if it.costPrice}
                      <span class="text-dim">• Cost: {fmtMoney(it.costPrice)}</span>
                    {/if}
                    • Total: <strong class="text-accent">{modelTotal} prs</strong>
                  </div>
                </div>

                <button
                  type="button"
                  class="btn btn-ghost btn-sm text-dim hover:text-bad p-1 h-7 w-7"
                  onclick={() => reorder.removeCode(it.productId)}
                  aria-label="Remove model"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>

              <!-- Model Quick Tools -->
              <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  class="chip cursor-pointer hover:border-accent hover:text-accent"
                  onclick={() => (activeAddSizeProductId = it.productId)}
                >
                  <Plus class="h-3 w-3" />
                  <span>Add Size</span>
                </button>

                <button
                  type="button"
                  class="chip cursor-pointer hover:border-accent hover:text-accent"
                  onclick={() => reorder.fillZeroStock(it.productId, 3)}
                  title="Set 3 pairs for all 0-stock sizes"
                >
                  <Sparkles class="h-3 w-3" />
                  <span>0-Stock (3)</span>
                </button>

                <button
                  type="button"
                  class="chip cursor-pointer hover:border-accent hover:text-accent"
                  onclick={() => reorder.fillCurrentStock(it.productId)}
                  title="Match current stock quantities"
                >
                  <span>Match Stock</span>
                </button>

                <button
                  type="button"
                  class="chip cursor-pointer hover:border-accent hover:text-accent"
                  onclick={() => reorder.addOneAll(it.productId)}
                  title="Add +1 to all sizes"
                >
                  <span>+1 All</span>
                </button>

                <button
                  type="button"
                  class="chip cursor-pointer hover:border-bad hover:text-bad"
                  onclick={() => reorder.zeroAll(it.productId)}
                  title="Reset all quantities to 0"
                >
                  <RotateCcw class="h-3 w-3" />
                  <span>Zero All</span>
                </button>
              </div>

              <!-- Sizes Table -->
              <div class="mt-3 overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="border-b border-line text-dim">
                      <th class="py-1.5 text-left font-medium">Size</th>
                      <th class="py-1.5 text-center font-medium">Stock</th>
                      <th class="py-1.5 text-right font-medium">Order Qty</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-line/40">
                    {#each it.variants as v (v.variantId)}
                      <tr>
                        <td class="py-2 font-medium text-fg">
                          Sz {v.displaySize || v.size}
                          {#if v.isCustom}
                            <span class="ml-1 rounded bg-accent/20 px-1 py-0.5 text-[9px] text-accent">Custom</span>
                          {/if}
                        </td>
                        <td class="py-2 text-center font-mono {v.currentStock === 0 ? 'text-bad' : 'text-muted'}">
                          {v.currentStock}
                        </td>
                        <td class="py-2 text-right">
                          <div class="inline-flex items-center gap-1">
                            <button
                              type="button"
                              class="grid h-7 w-7 place-items-center rounded border border-line bg-raised text-muted hover:border-accent hover:text-fg"
                              onclick={() => reorder.stepQty(it.productId, v.variantId, -1)}
                              aria-label="Decrease quantity"
                            >
                              <Minus class="h-3 w-3" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              class="input h-7 w-12 text-center font-mono font-semibold p-0 text-xs"
                              value={v.orderQty}
                              oninput={(e) => reorder.setQty(it.productId, v.variantId, (e.target as HTMLInputElement).value)}
                            />
                            <button
                              type="button"
                              class="grid h-7 w-7 place-items-center rounded border border-line bg-raised text-muted hover:border-accent hover:text-fg"
                              onclick={() => reorder.stepQty(it.productId, v.variantId, 1)}
                              aria-label="Increase quantity"
                            >
                              <Plus class="h-3 w-3" />
                            </button>
                            {#if v.isCustom}
                              <button
                                type="button"
                                class="ml-1 text-dim hover:text-bad p-1"
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

          <!-- Order Notes & Summary Card -->
          <div class="card p-4 space-y-3">
            <div>
              <label class="label" for="reorderNotesArea">Order Notes (සටහන්)</label>
              <textarea
                id="reorderNotesArea"
                class="input min-h-[64px] resize-y text-xs"
                placeholder="e.g. Urgent delivery needed by Friday; please confirm packing."
                bind:value={reorder.notes}
              ></textarea>
            </div>

            <!-- Totals -->
            <div class="rounded-xl bg-raised p-3 text-xs space-y-1">
              <div class="flex justify-between text-muted">
                <span>Total Shoe Styles:</span>
                <strong class="font-mono text-fg">{reorder.sheet.length} Styles</strong>
              </div>
              <div class="flex justify-between text-muted">
                <span>Total Quantity:</span>
                <strong class="font-mono text-accent text-sm">{sheetPairs} Pairs</strong>
              </div>
              {#if sheetCost > 0}
                <div class="flex justify-between text-muted">
                  <span>Est. Wholesale Cost:</span>
                  <strong class="font-mono text-fg">{fmtMoney(sheetCost)}</strong>
                </div>
              {/if}
            </div>

            <!-- Action buttons -->
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="btn btn-primary"
                onclick={() => reorder.copyWhatsAppOrder()}
              >
                <Copy class="h-4 w-4" />
                <span>Copy WhatsApp</span>
              </button>

              <button
                type="button"
                class="btn"
                onclick={() => reorder.directWhatsAppOrder()}
              >
                <Share2 class="h-4 w-4" />
                <span>Open WhatsApp</span>
              </button>

              <button
                type="button"
                class="btn"
                onclick={() => reorder.printPO()}
              >
                <Printer class="h-4 w-4" />
                <span>Print Order Slip</span>
              </button>

              <button
                type="button"
                class="btn"
                onclick={() => reorder.exportCSV()}
              >
                <FileDown class="h-4 w-4" />
                <span>CSV / Excel</span>
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

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
