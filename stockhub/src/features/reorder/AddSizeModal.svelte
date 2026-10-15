<script lang="ts">
  import { Plus, Check, X } from 'lucide-svelte';
  import { reorder } from './store.svelte';
  import { standardSizesFor } from './logic';

  let { productId, onclose }: { productId: string; onclose: () => void } = $props();

  let sizeVal = $state('');
  let qtyVal = $state('3');
  let inputEl: HTMLInputElement | undefined = $state();

  const item = $derived(reorder.find(productId));
  const quick = $derived(item ? standardSizesFor(item) : []);

  $effect(() => {
    const t = setTimeout(() => inputEl?.focus(), 150);
    return () => clearTimeout(t);
  });

  function quickAdd(sz: number, exists: boolean) {
    if (reorder.addCustomSize(productId, String(sz), exists ? 1 : 3)) onclose();
  }
  function confirm() {
    if (!sizeVal.trim()) {
      import('../../lib/app.svelte').then(({ app }) => app.toast('Please enter a shoe size (e.g. 6 or 40).', 'warning'));
      return;
    }
    if (reorder.addCustomSize(productId, sizeVal, qtyVal)) onclose();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

{#if item}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onclick={(e) => e.target === e.currentTarget && onclose()}>
    <div role="dialog" aria-modal="true" aria-labelledby="asm-title" class="card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 shadow-2xl sm:rounded-b-2xl">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 id="asm-title" class="truncate text-base font-semibold text-fg">Add Size: {item.brand} {item.name}</h3>
          <p class="mt-0.5 text-xs text-dim">{item.category} • Current sizes: {item.variants.map((v) => v.displaySize || v.size).join(', ')}</p>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" aria-label="Close" onclick={onclose}><X size={16} /></button>
      </div>

      <div class="label">Quick Add Standard Sizes (එක ක්ලික් එකෙන් එක්කරන්න)</div>
      <div class="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {#each quick as q (q.sz)}
          <button
            type="button"
            class="flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-center transition hover:border-accent {q.exists ? 'border-accent/40 bg-accent-soft' : 'border-line bg-raised'}"
            title={q.exists ? 'Already in order list. Click to +1 pair' : `Click to add Size ${q.disp} (3 pairs)`}
            onclick={() => quickAdd(q.sz, q.exists)}
          >
            <strong class="text-sm text-fg">Sz {q.disp}</strong>
            <span class="inline-flex items-center gap-1 text-[11px] text-muted">
              {#if q.exists}<Check size={12} /> In Order (+1){:else}<Plus size={12} /> Add (3 prs){/if}
            </span>
          </button>
        {/each}
      </div>

      <div class="flex gap-3">
        <div class="flex-[2]">
          <label class="label" for="customSizeInput">Or Type Custom Size (වෙනත් Size එකක්)</label>
          <input
            id="customSizeInput"
            type="text"
            class="input"
            placeholder="e.g. 5, 6, 10, 11, 46, XL"
            bind:this={inputEl}
            bind:value={sizeVal}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirm();
              }
            }}
          />
        </div>
        <div class="flex-1">
          <label class="label" for="customSizeQtyInput">Order Pairs (ජෝඩු)</label>
          <input id="customSizeQtyInput" type="number" class="input" min="1" max="999" bind:value={qtyVal} />
        </div>
      </div>

      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="btn" onclick={onclose}>Cancel</button>
        <button type="button" class="btn btn-primary" onclick={confirm}><Plus size={16} /> Add Size to Order Form</button>
      </div>
    </div>
  </div>
{/if}
