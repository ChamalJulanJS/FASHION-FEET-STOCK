<script lang="ts">
  import { FileDown, Printer, Copy, X } from 'lucide-svelte';
  import { app, fmtMoney } from '../../lib/app.svelte';
  import { reorder } from './store.svelte';
  import { countOptions, getMatchingModels, stockBranchDisplay } from './logic';

  let { onclose }: { onclose: () => void } = $props();

  let branch = $state(reorder.locId);
  let brand = $state(reorder.brand);
  let cat = $state(reorder.cat);
  let status = $state(reorder.status || 'ALL');

  const brands = $derived(countOptions('brand'));
  const cats = $derived(countOptions('category'));

  const preview = $derived.by(() => {
    app.syncVersion;
    const { matchingModels } = getMatchingModels({ locId: branch, brand, cat, status, query: '' });
    let pairs = 0;
    let retail = 0;
    for (const m of matchingModels) {
      pairs += m.totalStock;
      retail += m.totalStock * m.sellingPrice;
    }
    return {
      name: branch === 'ALL' ? 'All Branches' : (app.locations.find((l) => l.id === branch)?.name ?? 'Branch'),
      styles: matchingModels.length,
      pairs,
      retail,
    };
  });

  function run(fn: (l: string, b: string, c: string, s: string) => void) {
    const args: [string, string, string, string] = [branch, brand, cat, status];
    onclose();
    fn(...args);
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div role="dialog" aria-modal="true" aria-labelledby="psm-title" class="card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 shadow-2xl sm:rounded-b-2xl">
    <div class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 id="psm-title" class="text-base font-semibold text-fg">Print &amp; Export Branch Stock Report</h3>
        <p class="mt-0.5 text-xs text-dim">Select branch location and filters to generate accurate live stock reports</p>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" aria-label="Close" onclick={onclose}><X size={16} /></button>
    </div>

    <div class="space-y-3">
      <div>
        <label class="label" for="modalStockBranchSelect">Select Branch Location (ශාඛාව තෝරන්න)</label>
        <select id="modalStockBranchSelect" class="input" bind:value={branch}>
          <option value="ALL">All Branches Combined (සියලු ශාඛා)</option>
          {#each app.locations as loc (loc.id)}<option value={loc.id}>{loc.name}</option>{/each}
        </select>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label class="label" for="modalStockBrandSelect">Brand (වර්ගය)</label>
          <select id="modalStockBrandSelect" class="input" bind:value={brand}>
            <option value="ALL">All Brands (සියල්ල)</option>
            {#each brands as b (b.value)}<option value={b.value}>{b.value}</option>{/each}
          </select>
        </div>
        <div>
          <label class="label" for="modalStockCategorySelect">Category (කාණ්ඩය)</label>
          <select id="modalStockCategorySelect" class="input" bind:value={cat}>
            <option value="ALL">All Categories (සියල්ල)</option>
            {#each cats as c (c.value)}<option value={c.value}>{c.value}</option>{/each}
          </select>
        </div>
        <div>
          <label class="label" for="modalStockStatusSelect">Stock Status</label>
          <select id="modalStockStatusSelect" class="input" bind:value={status}>
            <option value="ALL">All Stock Levels</option>
            <option value="OUT_OF_STOCK">Has 0 Stock Sizes</option>
            <option value="LOW_STOCK">Low Stock (&lt; 3)</option>
            <option value="IN_STOCK">Well Stocked (3+)</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 rounded-xl border border-line bg-raised p-3 sm:grid-cols-4">
        <div class="min-w-0">
          <div class="text-[11px] uppercase tracking-wide text-dim">Selected Branch</div>
          <div class="truncate text-sm font-semibold text-accent">{preview.name}</div>
        </div>
        <div>
          <div class="text-[11px] uppercase tracking-wide text-dim">Matching Models</div>
          <div class="text-sm font-semibold text-fg tabular-nums">{preview.styles} Styles</div>
        </div>
        <div>
          <div class="text-[11px] uppercase tracking-wide text-dim">Total Stock</div>
          <div class="text-sm font-semibold text-fg tabular-nums">{preview.pairs} Pairs</div>
        </div>
        <div>
          <div class="text-[11px] uppercase tracking-wide text-dim">Retail Value</div>
          <div class="text-sm font-semibold text-fg tabular-nums">{fmtMoney(preview.retail)}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
        <button type="button" class="btn btn-primary" onclick={() => run((l, b, c, s) => reorder.printStockSheet(l, b, c, s))}>
          <Printer size={16} /> Print Inventory Sheet
        </button>
        <button type="button" class="btn" onclick={() => run((l, b, c, s) => reorder.exportStockCSV(l, b, c, s))}>
          <FileDown size={16} /> Export CSV
        </button>
        <button type="button" class="btn" onclick={() => run((l, b, c, s) => reorder.copyStockWhatsApp(l, b, c, s))}>
          <Copy size={16} /> Copy for WhatsApp
        </button>
      </div>
    </div>
  </div>
</div>
