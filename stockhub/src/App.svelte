<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/app.svelte';
  import Navbar from './components/Navbar.svelte';
  import MobileNav from './components/MobileNav.svelte';
  import Toasts from './components/Toasts.svelte';
  import AuthModal from './components/AuthModal.svelte';
  import StaffManager from './components/StaffManager.svelte';
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
</script>

<div class="flex min-h-full flex-col bg-bg text-fg">
  <Navbar />
  <main class="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-10">
    <!-- Keep Transfer mounted so cart/scanner state survives tab switches -->
    <div class:hidden={app.tab !== 'transfer'}><Transfer /></div>
    {#if app.tab === 'reorder'}<Reorder />{/if}
    {#if app.tab === 'stockcount'}<StockCount />{/if}
    {#if app.tab === 'history'}<History />{/if}
  </main>
  <MobileNav />
  <AuthModal />
  <StaffManager />
  <Toasts />
</div>
