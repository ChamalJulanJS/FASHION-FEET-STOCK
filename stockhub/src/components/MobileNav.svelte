<script lang="ts">
  import { app, type HubTab } from '../lib/app.svelte';
  import { ArrowLeftRight, PackageSearch, History, Users, PackageCheck } from 'lucide-svelte';

  const items: { id: HubTab; label: string; icon: any }[] = [
    { id: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
    { id: 'reorder', label: 'Reorder', icon: PackageSearch },
    { id: 'history', label: 'History', icon: History },
  ];
  const cartCount = $derived(app.cart.reduce((n, l) => n + l.qty, 0));
</script>

<nav
  class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
  aria-label="Mobile"
>
  {#each items as it}
    {@const Icon = it.icon}
    <button
      class="relative flex cursor-pointer flex-col items-center gap-1 py-2.5 text-[11px] font-medium {app.tab === it.id ? 'text-accent' : 'text-dim'}"
      onclick={() => (app.tab = it.id)}
    >
      <Icon class="h-5 w-5" />{it.label}
      {#if it.id === 'transfer' && cartCount > 0}
        <span class="absolute right-[28%] top-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-white">{cartCount}</span>
      {/if}
    </button>
  {/each}
  <a href="transfer_receiver.html" class="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-dim">
    <PackageCheck class="h-5 w-5" />Receiver
  </a>
  <button class="flex cursor-pointer flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-dim" onclick={() => (app.staffManagerOpen = true)}>
    <Users class="h-5 w-5" />Staff
  </button>
</nav>
