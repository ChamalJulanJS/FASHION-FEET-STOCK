<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/app.svelte';
  import Navbar from './components/Navbar.svelte';
  import MobileNav from './components/MobileNav.svelte';
  import Toasts from './components/Toasts.svelte';
  import AuthModal from './components/AuthModal.svelte';
  import StaffManager from './components/StaffManager.svelte';
  import BranchStockModal from './components/BranchStockModal.svelte';
  import SizeFinderModal from './features/sizefinder/SizeFinderModal.svelte';
  import Pos from './features/pos/Pos.svelte';
  import Grn from './features/grn/Grn.svelte';
  import Transfer from './features/transfer/Transfer.svelte';
  import Reorder from './features/reorder/Reorder.svelte';
  import StockCount from './features/stockcount/StockCount.svelte';
  import History from './features/history/History.svelte';

  onMount(() => {
    app.init();
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      app.deferredPwaPrompt = e;
    });
  });

  $effect(() => {
    try {
      localStorage.setItem('ff_hub_active_tab', app.tab);
    } catch {}
  });
</script>

<div class="flex min-h-full flex-col bg-bg text-fg">
  <Navbar />
  <main class="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-10">
    <!-- Keep Pos, Grn, Transfer and StockCount mounted so state/scanner survives tab switches -->
    <div class:hidden={app.tab !== 'pos'}><Pos /></div>
    <div class:hidden={app.tab !== 'grn'}><Grn /></div>
    <div class:hidden={app.tab !== 'transfer'}><Transfer /></div>
    <div class:hidden={app.tab !== 'stockcount'}><StockCount /></div>
    {#if app.tab === 'reorder'}<Reorder />{/if}
    {#if app.tab === 'history'}<History />{/if}
  </main>
  <MobileNav />
  <AuthModal />
  <StaffManager />
  {#if app.branchStockModalOpen}
    <BranchStockModal />
  {/if}
  {#if app.sizeFinderOpen}
    <SizeFinderModal />
  {/if}
  <Toasts />
</div>
