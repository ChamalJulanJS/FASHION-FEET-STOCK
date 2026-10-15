<script lang="ts">
  import { History as HistoryIcon } from 'lucide-svelte';
  import TransferLog from './TransferLog.svelte';
</script>

<section class="space-y-4">
  <header class="flex items-center gap-3">
    <span class="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent"><HistoryIcon class="size-5" /></span>
    <div>
      <h1 class="text-lg font-semibold text-fg">Transfer history</h1>
      <p class="text-xs text-muted">Most recent 15 branch transfers. Open a slip to view or reprint.</p>
    </div>
  </header>
  <TransferLog limit={15} />
</section>
