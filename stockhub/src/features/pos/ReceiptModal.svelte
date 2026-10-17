<script lang="ts">
  import { CheckCircle2, Printer, X, MessageCircle, Copy, Phone, Loader2 } from 'lucide-svelte';
  import { app, fmtMoney } from '../../lib/app.svelte';
  import {
    type PosReceiptDetails,
    formatInvoiceNo,
    buildWhatsAppReceiptText,
    openWhatsAppReceipt,
    printPosThermalReceipt,
    sendReceiptToPcPrinter,
  } from './logic';

  let {
    receipt,
    success = false,
    onclose,
  }: {
    receipt: PosReceiptDetails;
    success?: boolean;
    onclose: () => void;
  } = $props();

  let phoneInput = $state('');
  let pcPrintBusy = $state(false);
  let pcPrintDone = $state(false);

  $effect(() => {
    phoneInput = receipt.customerPhone || receipt.customer?.phone || '';
  });

  function handlePrint(width: '80mm' | '58mm') {
    if (!printPosThermalReceipt(receipt, width)) {
      app.toast('Please allow popups in your browser to print the receipt.', 'warning');
    }
  }

  async function handlePcPrint() {
    if (pcPrintBusy) return;
    pcPrintBusy = true;
    try {
      const res = await sendReceiptToPcPrinter(receipt, receipt.locationId);
      if (res.ok) {
        pcPrintDone = true;
        app.toast(res.message, 'success');
      } else {
        app.toast(res.message, 'error');
      }
    } finally {
      pcPrintBusy = false;
    }
  }

  function handleWhatsApp() {
    openWhatsAppReceipt(receipt, phoneInput);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildWhatsAppReceiptText(receipt));
      app.toast('Digital receipt copied to clipboard!', 'success');
    } catch {
      app.toast('Could not copy receipt text.', 'error');
    }
  }

  const totalPairs = $derived(receipt.items.reduce((s, i) => s + i.qty, 0));
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div
  class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
  role="presentation"
>
  <div
    class="card flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-b-none sm:rounded-b-2xl shadow-2xl"
    role="dialog"
    aria-modal="true"
    aria-label="POS Sale Receipt"
  >
    <!-- Header -->
    <div class="flex items-start justify-between gap-3 border-b border-line bg-raised/70 p-4">
      <div class="flex items-center gap-3">
        {#if success}
          <div class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ok/15 text-ok border border-ok/30">
            <CheckCircle2 class="h-5 w-5" />
          </div>
        {/if}
        <div>
          <h3 class="font-display text-base font-bold text-fg">
            {success ? 'Sale Completed! (බිල සාර්ථකයි)' : 'POS Sale Receipt'}
          </h3>
          <p class="text-xs text-muted">
            {success ? 'Live branch stock & sales register updated in Supabase.' : 'Viewing saved POS invoice.'}
          </p>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm size-8 p-0" onclick={onclose} aria-label="Close">
        <X class="size-4" />
      </button>
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto p-4 space-y-3.5">
      <!-- Invoice Banner -->
      <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-dim">Invoice No</div>
          <div class="font-mono text-base font-bold text-fg">{formatInvoiceNo(receipt.invoiceNo, receipt.id)}</div>
          <div class="text-[11px] text-muted">{receipt.date}</div>
        </div>
        <div class="text-right">
          <span class="chip font-semibold text-fg">{receipt.branchName}</span>
          <div class="mt-1 text-[11px] text-muted">
            Cashier: <strong class="text-fg">{receipt.cashierName}</strong> ·
            <span class="uppercase font-mono">{receipt.paymentMethod}</span>
          </div>
        </div>
      </div>

      <!-- Counter PC Printer Direct Trigger -->
      <div class="flex items-center justify-between gap-2 rounded-xl border border-fg/20 bg-raised p-3">
        <div class="min-w-0">
          <div class="text-xs font-bold text-fg flex items-center gap-1.5">
            <Printer class="h-4 w-4 text-ok shrink-0" />
            <span>Counter PC Thermal Printer ({receipt.branchName})</span>
          </div>
          <p class="text-[11px] text-muted">
            Prints directly on the USB thermal printer connected to the PC POS.
          </p>
        </div>
        <button
          type="button"
          class="btn btn-primary btn-sm h-9 shrink-0 px-3 font-bold"
          onclick={handlePcPrint}
          disabled={pcPrintBusy}
        >
          {#if pcPrintBusy}
            <Loader2 class="h-3.5 w-3.5 animate-spin" />
            <span>Sending...</span>
          {:else}
            <Printer class="h-3.5 w-3.5" />
            <span>{pcPrintDone ? 'Re-Print on PC' : 'Print on PC'}</span>
          {/if}
        </button>
      </div>

      <!-- WhatsApp Digital Bill Box (Power-Outage Friendly!) -->
      <div class="rounded-xl border border-ok/30 bg-ok/5 p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-fg flex items-center gap-1.5">
            <MessageCircle class="h-4 w-4 text-ok" />
            <span>Send Digital Bill via WhatsApp (Customer ගේ Phone එකට)</span>
          </span>
        </div>
        <div class="flex gap-2">
          <div class="relative flex-1">
            <Phone class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
            <input
              type="tel"
              class="input h-9 pl-8 text-xs font-mono"
              placeholder="Customer Phone (e.g. 0771234567)"
              bind:value={phoneInput}
            />
          </div>
          <button
            type="button"
            class="btn btn-sm h-9 bg-ok text-black font-bold hover:opacity-90 border-0 shrink-0 px-3"
            onclick={handleWhatsApp}
          >
            <MessageCircle class="h-3.5 w-3.5" />
            <span>WhatsApp Bill</span>
          </button>
          <button
            type="button"
            class="btn btn-sm h-9 shrink-0 px-2.5"
            onclick={handleCopy}
            title="Copy Digital Receipt Text"
          >
            <Copy class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <!-- Items Table -->
      <div class="overflow-hidden rounded-xl border border-line bg-surface">
        <table class="w-full text-xs">
          <thead class="bg-raised border-b border-line">
            <tr>
              <th class="th py-2 pl-3">Item / Size</th>
              <th class="th py-2 text-center">Qty</th>
              <th class="th py-2 text-right">Price</th>
              <th class="th py-2 pr-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            {#each receipt.items as it}
              <tr>
                <td class="td py-2 pl-3">
                  <div class="font-semibold text-fg">
                    {it.brand ? `${it.brand} · ` : ''}{it.name}
                  </div>
                  <div class="font-mono text-[11px] text-muted">
                    {it.sku} · <span class="text-fg font-semibold">Sz {it.displaySize}</span>
                    {#if it.colour} · {it.colour}{/if}
                  </div>
                </td>
                <td class="td py-2 text-center font-mono font-bold">{it.qty}</td>
                <td class="td py-2 text-right font-mono text-muted">{it.unitPrice.toLocaleString()}</td>
                <td class="td py-2 pr-3 text-right font-mono font-bold text-fg">{it.lineTotal.toLocaleString()}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Totals Box -->
      <div class="rounded-xl border border-line bg-raised/60 p-3.5 space-y-1.5 text-xs">
        <div class="flex justify-between text-muted">
          <span>Subtotal ({totalPairs} pairs)</span>
          <span class="font-mono">{fmtMoney(receipt.subtotal)}</span>
        </div>
        {#if receipt.discount > 0}
          <div class="flex justify-between text-warn">
            <span>Discount (වට්ටම)</span>
            <span class="font-mono">- {fmtMoney(receipt.discount)}</span>
          </div>
        {/if}
        <div class="flex justify-between border-t border-line pt-2 text-sm font-bold text-fg">
          <span>GRAND TOTAL (මුළු මුදල)</span>
          <span class="font-mono text-base">{fmtMoney(receipt.grandTotal)}</span>
        </div>
        {#if receipt.cashReceived > 0}
          <div class="flex justify-between pt-1 text-muted">
            <span>Cash Received (ලැබුණු මුදල)</span>
            <span class="font-mono">{fmtMoney(receipt.cashReceived)}</span>
          </div>
          <div class="flex justify-between text-sm font-bold text-ok">
            <span>Change Given (ඉතිරි මුදල)</span>
            <span class="font-mono">{fmtMoney(receipt.changeAmount)}</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Footer Actions -->
    <div class="flex flex-wrap gap-2 border-t border-line bg-surface p-3.5">
      <button type="button" class="btn btn-sm flex-1" onclick={() => handlePrint('80mm')}>
        <Printer class="size-3.5" />
        <span>Phone 80mm</span>
      </button>
      <button type="button" class="btn btn-sm flex-1" onclick={() => handlePrint('58mm')}>
        <Printer class="size-3.5" />
        <span>Phone 58mm</span>
      </button>
      <button type="button" class="btn btn-primary btn-sm flex-[1.5]" onclick={onclose}>
        <span>{success ? 'Done & Next Bill (ඊළඟ බිල)' : 'Close'}</span>
      </button>
    </div>
  </div>
</div>
