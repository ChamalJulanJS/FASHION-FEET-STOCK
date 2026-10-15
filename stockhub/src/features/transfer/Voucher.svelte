<script lang="ts">
  import { CheckCircle2, Printer, X, ArrowRight } from 'lucide-svelte';
  import { app, getShoeDisplaySize } from '../../lib/app.svelte';
  import { printVoucher, voucherNumber, voucherPairs, voucherType, type VoucherDetails } from '../../lib/voucher';

  let {
    details,
    success = false,
    onclose,
  }: { details: VoucherDetails; success?: boolean; onclose: () => void } = $props();

  function print() {
    if (!printVoucher(details)) app.toast('Please allow popups to print the voucher.', 'warning');
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation">
  <div
    class="card flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-b-none sm:rounded-b-2xl"
    role="dialog"
    aria-modal="true"
    aria-label="Dispatch voucher"
  >
    <div class="flex items-start justify-between gap-3 border-b border-line p-4">
      <div class="flex items-center gap-3">
        {#if success}
          <CheckCircle2 class="size-6 text-accent" aria-hidden="true" />
        {/if}
        <div>
          <h3 class="text-base font-semibold text-fg">{success ? 'Transfer completed' : 'Dispatch voucher'}</h3>
          <p class="text-xs text-muted">
            {success ? 'Inventory records and stock balances were updated in real time.' : 'Reprint of a past transfer.'}
          </p>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick={onclose} aria-label="Close"><X class="size-4" /></button>
    </div>

    <div class="overflow-y-auto p-4">
      <div class="mb-3 flex items-center justify-between">
        <span class="font-mono text-sm font-semibold text-accent">{voucherNumber(details)}</span>
        <span class="chip">{voucherType(details)}</span>
      </div>
      <p class="mb-3 text-xs text-muted">{details.date}</p>

      <div class="mb-3 flex items-center gap-2 rounded-lg border border-line bg-raised p-3 text-sm">
        <div class="min-w-0 flex-1">
          <div class="text-[10px] uppercase tracking-wider text-dim">From</div>
          <div class="truncate font-medium text-fg">{details.fromName}</div>
        </div>
        <ArrowRight class="size-4 shrink-0 text-dim" aria-hidden="true" />
        <div class="min-w-0 flex-1 text-right">
          <div class="text-[10px] uppercase tracking-wider text-dim">To</div>
          <div class="truncate font-medium text-fg">{details.toName}</div>
        </div>
      </div>

      {#if details.driverNotes}
        <div class="mb-3 rounded-lg border border-line px-3 py-2 text-xs text-muted">
          <span class="font-medium text-fg">Dispatch / courier details:</span> {details.driverNotes}
        </div>
      {/if}

      <div class="overflow-hidden rounded-lg border border-line">
        <table class="w-full text-sm">
          <thead class="bg-raised">
            <tr><th class="th w-8">#</th><th class="th">Item</th><th class="th text-center">Size</th><th class="th text-right">Qty</th></tr>
          </thead>
          <tbody class="divide-y divide-line">
            {#each details.items as it, i}
              {@const v = it.variant}
              <tr>
                <td class="td text-dim">{i + 1}</td>
                <td class="td">
                  <div class="font-medium text-fg">{v.products?.brand ? v.products.brand + ' ' : ''}{v.products?.name || v.sku}</div>
                  <div class="font-mono text-[11px] text-dim">{v.sku} · {v.colour || '-'}</div>
                </td>
                <td class="td text-center">{getShoeDisplaySize(v.size, v.products)}</td>
                <td class="td text-right font-mono font-semibold">{it.qty}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="mt-3 flex items-center justify-between text-sm">
        <span class="text-muted">{details.items.length} styles · {details.dispatchedByName}</span>
        <span class="font-semibold text-fg">{voucherPairs(details)} pairs</span>
      </div>
    </div>

    <div class="flex gap-2 border-t border-line p-4">
      <button class="btn flex-1" onclick={print}><Printer class="size-4" /> Print thermal slip</button>
      <button class="btn btn-primary flex-1" onclick={onclose}>{success ? 'Done & next transfer' : 'Close'}</button>
    </div>
  </div>
</div>
