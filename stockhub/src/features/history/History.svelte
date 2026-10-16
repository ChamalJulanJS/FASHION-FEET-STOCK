<script lang="ts">
  import { History as HistoryIcon } from 'lucide-svelte';
  import TransferLog from './TransferLog.svelte';
</script>

<section class="space-y-4">
  <header class="card flex items-center gap-3 p-4 sm:px-5">
    <span class="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-raised text-fg">
      <HistoryIcon class="size-4" />
    </span>
    <div>
      <h1 class="font-display text-base font-bold text-fg">Branch Transfer Audit History</h1>
      <p class="text-xs text-dim">Most recent branch transfers · Open any record to inspect or reprint the 80mm thermal slip</p>
    </div>
  </header>
  <TransferLog limit={25} />
</section>
