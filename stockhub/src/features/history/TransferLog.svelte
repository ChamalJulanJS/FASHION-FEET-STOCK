<script lang="ts">
  import { RefreshCw, Printer, ArrowRight } from 'lucide-svelte';
  import { app } from '../../lib/app.svelte';
  import { restGet } from '../../lib/api';
  import { SoundFx } from '../../lib/sound';
  import type { VoucherDetails } from '../../lib/voucher';
  import Voucher from '../transfer/Voucher.svelte';

  let { refreshToken = 0, limit = 15 }: { refreshToken?: number; limit?: number } = $props();

  interface TransferRow {
    id: string;
    created_at?: string;
    from_location?: string;
    to_location?: string;
    status?: string;
    dispatched_at?: string;
  }

  let transfers = $state<TransferRow[]>([]);
  let loading = $state(true);
  let voucher = $state<VoucherDetails | null>(null);
  let slipBusy = $state<string | null>(null);

  async function fetchRecentTransfers() {
    loading = true;
    try {
      transfers = (await restGet<TransferRow[]>(`transfers?select=*&order=created_at.desc&limit=${limit}`)) || [];
    } catch (err) {
      console.warn('History fetch warning:', err);
      transfers = [];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    refreshToken;
    fetchRecentTransfers();
  });

  const dateStr = (t: TransferRow) =>
    t.created_at
      ? new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : 'Just now';
  const fromName = (t: TransferRow) => app.locations.find((l) => l.id === t.from_location)?.name || 'Dispatch Shop';
  const toName = (t: TransferRow) => app.locations.find((l) => l.id === t.to_location)?.name || 'Receiving Shop';
  const isReceived = (t: TransferRow) => t.status === 'received' || t.status === 'Received';

  async function viewSlip(transferId: string) {
    app.toast('Loading transfer items...', 'info');
    slipBusy = transferId;
    try {
      const rows = await restGet<TransferRow[]>(`transfers?id=eq.${transferId}&select=*`);
      const t = rows[0];
      if (!t) throw new Error('Transfer not found');
      const movements = await restGet<{ variant_id: string; quantity: number }[]>(
        `stock_movements?reference_id=eq.${transferId}&quantity=gt.0&select=*`,
      );
      const items = (movements || []).map((m) => ({
        variant: app.catalog.find((c) => c.id === m.variant_id) || ({ sku: 'N/A', size: 'N/A' } as any),
        qty: m.quantity,
      }));
      voucher = {
        id: t.id,
        fromName: fromName(t),
        toName: toName(t),
        status: t.status || '',
        driverNotes: `Dispatched at: ${t.dispatched_at || t.created_at}`,
        dispatchedByName: 'Verified Staff',
        date: new Date(t.created_at as string).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
        items: items.length > 0 ? items : [{ variant: { sku: 'Items recorded', size: '-' } as any, qty: 1 }],
      };
    } catch (e: any) {
      app.toast('Error loading past transfer: ' + e.message, 'error');
    } finally {
      slipBusy = null;
    }
  }
</script>

<div class="card min-w-0 overflow-hidden">
  <div class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
    <div class="min-w-0">
      <h2 class="text-sm font-semibold text-fg">Recent branch transfers</h2>
      <p class="truncate text-xs text-muted">Live audit feed of transferred and dispatched batches</p>
    </div>
    <button
      class="btn btn-sm"
      onclick={() => {
        SoundFx.scan();
        fetchRecentTransfers();
        app.toast('Transfer audit logs refreshed!', 'info');
      }}
      aria-label="Refresh transfer history"
    >
      <RefreshCw class="size-3.5 {loading ? 'animate-spin' : ''}" />
      <span class="hidden sm:inline">Refresh</span>
    </button>
  </div>

  {#if loading && transfers.length === 0}
    <p class="px-4 py-8 text-center text-sm text-muted">Connecting to Supabase transfers feed...</p>
  {:else if transfers.length === 0}
    <p class="px-4 py-8 text-center text-sm text-muted">No recent transfers recorded in database.</p>
  {:else}
    <!-- Mobile: card list -->
    <ul class="divide-y divide-line sm:hidden">
      {#each transfers as t (t.id)}
        <li class="flex items-center justify-between gap-3 px-4 py-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-semibold text-fg">#{t.id ? t.id.slice(0, 8).toUpperCase() : 'TRN'}</span>
              <span class="chip py-0 text-[10px] {isReceived(t) ? 'text-ok border-ok/30 bg-ok/5' : 'text-warn border-warn/30 bg-warn/5'}">
                {isReceived(t) ? 'Received' : 'In-Transit'}
              </span>
            </div>
            <div class="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-fg">
              <span class="truncate">{fromName(t)}</span>
              <ArrowRight class="size-3 shrink-0 text-dim" aria-hidden="true" />
              <span class="truncate">{toName(t)}</span>
            </div>
            <div class="mt-0.5 font-mono text-[11px] text-dim">{dateStr(t)}</div>
          </div>
          <button class="btn btn-sm shrink-0" disabled={slipBusy === t.id} onclick={() => viewSlip(t.id)} aria-label="Reprint dispatch slip">
            <Printer class="size-3.5 text-muted" />
            <span>Slip</span>
          </button>
        </li>
      {/each}
    </ul>

    <!-- Tablet / desktop: table -->
    <div class="hidden overflow-x-auto sm:block">
      <table class="w-full min-w-[600px]">
        <thead class="bg-raised/50">
          <tr>
            <th class="th">Transfer ID</th>
            <th class="th">Date &amp; time</th>
            <th class="th">Route</th>
            <th class="th">Status</th>
            <th class="th text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          {#each transfers as t (t.id)}
            <tr class="transition-colors hover:bg-raised/40">
              <td class="td font-mono text-xs font-semibold text-fg">#{t.id ? t.id.slice(0, 8).toUpperCase() : 'TRN'}</td>
              <td class="td whitespace-nowrap font-mono text-xs text-muted">{dateStr(t)}</td>
              <td class="td">
                <span class="inline-flex items-center gap-2 whitespace-nowrap text-xs font-medium text-fg">
                  <span>{fromName(t)}</span>
                  <ArrowRight class="size-3.5 text-dim" aria-hidden="true" />
                  <span>{toName(t)}</span>
                </span>
              </td>
              <td class="td">
                <span class="chip text-[11px] {isReceived(t) ? 'text-ok border-ok/30 bg-ok/5' : 'text-warn border-warn/30 bg-warn/5'}">
                  {isReceived(t) ? 'Received' : 'In-Transit'}
                </span>
              </td>
              <td class="td text-right">
                <button class="btn btn-sm" disabled={slipBusy === t.id} onclick={() => viewSlip(t.id)} title="Reprint official dispatch slip">
                  <Printer class="size-3.5 text-muted" />
                  <span>Slip</span>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if voucher}
  <Voucher details={voucher} onclose={() => (voucher = null)} />
{/if}
