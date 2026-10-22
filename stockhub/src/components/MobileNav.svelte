<script lang="ts">
  import { app, type HubTab } from '../lib/app.svelte';
  import { ShoppingBag, PackagePlus, ArrowLeftRight, PackageSearch, ClipboardCheck, History, Footprints } from 'lucide-svelte';

  const items: { id: HubTab; label: string; icon: any }[] = [
    { id: 'pos', label: 'POS Bill', icon: ShoppingBag },
    { id: 'grn', label: 'GRN', icon: PackagePlus },
    { id: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
    { id: 'reorder', label: 'Reorder', icon: PackageSearch },
    { id: 'stockcount', label: 'Stock Take', icon: ClipboardCheck },
    { id: 'history', label: 'History', icon: History },
  ];
  const cartCount = $derived(app.cart.reduce((n, l) => n + l.qty, 0));
</script>

<!-- Mobile Floating Quick Size Finder Button -->
<button
  type="button"
  class="fixed bottom-[70px] right-3 z-40 flex items-center gap-2 rounded-full border border-accent/40 bg-accent px-3.5 py-2 font-bold text-bg shadow-2xl active:scale-95 transition-all md:hidden"
  onclick={() => (app.sizeFinderOpen = true)}
  title="Smart Foot Size Finder & AR Caliper (කකුල මැන Size එක සෙවීම)"
>
  <Footprints class="h-4 w-4 shrink-0" />
  <span class="text-xs font-black tracking-tight">Size Finder</span>
</button>

<nav
  class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
  aria-label="Mobile"
>
  {#each items as it}
    {@const Icon = it.icon}
    {@const active = app.tab === it.id}
    <button
      class="relative flex cursor-pointer flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition {active ? 'text-fg font-semibold' : 'text-dim hover:text-muted'}"
      onclick={() => (app.tab = it.id)}
    >
      <Icon class="h-4 w-4" />{it.label}
      {#if it.id === 'transfer' && cartCount > 0}
        <span class="absolute right-[20%] top-1.5 grid min-w-4 place-items-center rounded-full bg-fg px-1 font-mono text-[10px] font-bold leading-4 text-bg">{cartCount}</span>
      {/if}
    </button>
  {/each}
</nav>
