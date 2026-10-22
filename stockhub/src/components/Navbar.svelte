<script lang="ts">
  import { app, type HubTab } from '../lib/app.svelte';
  import {
    Boxes, ArrowLeftRight, History, PackageSearch, PackageCheck, ClipboardCheck, RefreshCw, Sun, Moon, Volume2, VolumeX,
    Download, User, ChevronDown, Users, KeyRound, LogOut, Share, PlusSquare, X, Smartphone, Store, ShoppingBag, PackagePlus,
    Glasses,
  } from 'lucide-svelte';

  let menuOpen = $state(false);
  let iosInstallOpen = $state(false);

  const isIos =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  const isStandalone =
    typeof window !== 'undefined' &&
    ((window.navigator as any).standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches);

  const canShowInstall = $derived(!isStandalone && (Boolean(app.deferredPwaPrompt) || isIos));

  const tabs: { id: HubTab; label: string; icon: any }[] = [
    { id: 'pos', label: 'POS Bill', icon: ShoppingBag },
    { id: 'grn', label: 'GRN', icon: PackagePlus },
    { id: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
    { id: 'reorder', label: 'Stock & Reorder', icon: PackageSearch },
    { id: 'stockcount', label: 'Stock Count', icon: ClipboardCheck },
    { id: 'history', label: 'History', icon: History },
  ];

  const cartCount = $derived(app.cart.reduce((n, l) => n + l.qty, 0));

  async function install() {
    const p = app.deferredPwaPrompt;
    if (p) {
      p.prompt();
      await p.userChoice;
      app.deferredPwaPrompt = null;
      return;
    }
    if (isIos) {
      iosInstallOpen = true;
    }
  }
  function openReset() {
    menuOpen = false;
    app.authTab = 'reset';
    app.authMandatory = false;
    app.authOpen = true;
  }
  const dot = $derived(
    app.connStatus === 'connected' ? 'bg-ok' : app.connStatus === 'error' ? 'bg-bad' : 'bg-warn animate-pulse',
  );
  const compactStatus = $derived(
    app.isSyncing
      ? 'Syncing...'
      : app.connStatus === 'connected'
        ? `${app.catalog.length.toLocaleString()} SKUs`
        : app.connStatus === 'error'
          ? 'Offline'
          : 'Connecting...',
  );
</script>

<svelte:window onclick={() => (menuOpen = false)} />

<header class="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md">
  <div class="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-2 px-3 md:px-5">
    <!-- Brand + Primary Navigation -->
    <div class="flex items-center gap-3 min-w-0">
      <button
        type="button"
        class="flex items-center gap-2 text-left whitespace-nowrap shrink-0 cursor-pointer focus:outline-none"
        onclick={() => (app.tab = 'transfer')}
      >
        <div class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fg text-bg shadow-xs">
          <Boxes class="h-4 w-4" />
        </div>
        <div class="leading-none">
          <div class="font-display text-sm font-bold tracking-tight text-fg">
            <span class="sm:hidden">FF Hub</span>
            <span class="hidden sm:inline">FashionFeet</span>
          </div>
          <div class="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-dim hidden sm:block">
            Stock Hub
          </div>
        </div>
      </button>

      <div class="hidden h-5 w-px bg-line md:block"></div>

      <nav class="hidden items-center gap-0.5 rounded-lg border border-line bg-surface p-1 md:flex" aria-label="Primary">
        {#each tabs as t}
          {@const Icon = t.icon}
          {@const active = app.tab === t.id}
          <button
            type="button"
            class="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition
              {active ? 'bg-fg text-bg font-semibold shadow-xs' : 'text-muted hover:bg-raised hover:text-fg'}"
            onclick={() => (app.tab = t.id)}
            aria-current={active ? 'page' : undefined}
          >
            <Icon class="h-3.5 w-3.5 shrink-0" />
            <span>{t.label}</span>
            {#if t.id === 'transfer' && cartCount > 0}
              <span
                class="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold
                  {active ? 'bg-bg text-fg' : 'bg-fg text-bg'}"
              >
                {cartCount}
              </span>
            {/if}
          </button>
        {/each}
        <a
          href="transfer_receiver.html"
          class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted whitespace-nowrap shrink-0 transition hover:bg-raised hover:text-fg"
          title="Open Transfer Receiver to split generic sizes"
        >
          <PackageCheck class="h-3.5 w-3.5 shrink-0" />
          <span><span class="hidden xl:inline">Size </span>Receiver</span>
        </a>
      </nav>
    </div>

    <!-- Right Utilities -->
    <div class="flex items-center gap-1 sm:gap-1.5 shrink-0">
      <button
        type="button"
        class="btn btn-sm gap-1 px-2 sm:px-2.5 text-accent border-accent/40 bg-accent/10 hover:bg-accent/20"
        onclick={() => (app.arMeasureOpen = true)}
        title="WebXR 3D AR Foot Measure (Android/Samsung 3D මැනීම)"
      >
        <Glasses class="h-3.5 w-3.5 shrink-0 text-accent" />
        <span class="text-xs font-bold">3D AR</span>
      </button>

      <button
        type="button"
        class="btn btn-sm gap-1.5 px-2.5"
        onclick={() => (app.branchStockModalOpen = true)}
        title="Check Live Branch Stock (ශාඛා තොග පරීක්ෂාව)"
      >
        <Store class="h-3.5 w-3.5 shrink-0 text-ok" />
        <span class="hidden sm:inline">Check Stock</span>
        <span class="sm:hidden">Stock</span>
      </button>

      <button
        type="button"
        class="btn btn-sm gap-1.5 px-2 sm:px-2.5 text-muted hover:text-fg"
        onclick={() => app.syncCatalogAndStock()}
        disabled={app.isSyncing}
        title="{app.connText} — Click to sync catalog & stock"
      >
        <span class="h-2 w-2 shrink-0 rounded-full {dot}"></span>
        <span class="hidden font-mono text-[11px] xl:inline">{compactStatus}</span>
        <RefreshCw class="h-3.5 w-3.5 shrink-0 text-dim {app.isSyncing ? 'animate-spin text-fg' : ''}" />
      </button>

      {#if canShowInstall}
        <button class="btn btn-sm hidden sm:inline-flex gap-1.5 px-2.5" onclick={install} title="Install FashionFeet Stock Hub App">
          <Download class="h-3.5 w-3.5 shrink-0" />
          <span class="hidden lg:inline">Install</span>
        </button>
      {/if}

      <button
        type="button"
        class="btn btn-ghost btn-sm hidden sm:inline-flex w-8 p-0"
        onclick={() => app.toggleTheme()}
        title="Switch theme ({app.theme === 'dark' ? 'Light mode' : 'Dark mode'})"
        aria-label="Switch theme"
      >
        {#if app.theme === 'dark'}<Sun class="h-4 w-4" />{:else}<Moon class="h-4 w-4" />{/if}
      </button>

      <button
        type="button"
        class="btn btn-ghost btn-sm hidden sm:inline-flex w-8 p-0"
        onclick={() => app.toggleSound()}
        title="Sound effects: {app.soundEnabled ? 'On' : 'Off'}"
        aria-label="Toggle sound"
      >
        {#if app.soundEnabled}<Volume2 class="h-4 w-4" />{:else}<VolumeX class="h-4 w-4 text-dim" />{/if}
      </button>

      <div class="relative">
        <button
          type="button"
          class="btn btn-sm gap-1.5 px-2 sm:gap-2 sm:pl-2.5 sm:pr-2"
          onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; }}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <User class="h-3.5 w-3.5 shrink-0 text-muted" />
          <span class="hidden max-w-[120px] truncate text-xs font-medium text-fg sm:inline">
            {app.currentUser?.name ?? 'Sign in'}
          </span>
          <ChevronDown class="h-3.5 w-3.5 shrink-0 text-dim" />
        </button>

        {#if menuOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-xl shadow-black/30"
            role="menu"
            tabindex="-1"
            onclick={(e) => e.stopPropagation()}
          >
            <div class="border-b border-line px-4 py-3">
              <div class="flex items-center justify-between gap-2">
                <div class="truncate text-xs font-semibold text-fg">{app.currentUser?.name ?? 'Not signed in'}</div>
                {#if app.currentUser?.role}
                  <span class="chip text-[10px] uppercase">{app.currentUser.role}</span>
                {/if}
              </div>
              <div class="mt-0.5 truncate font-mono text-[11px] text-dim">
                {app.currentUser?.email ?? 'Please log in to continue'}
              </div>
            </div>
            <div class="p-1.5">
              <div class="mb-1 grid grid-cols-2 gap-1 border-b border-line pb-1.5 sm:hidden">
                <button
                  type="button"
                  class="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 py-2 text-xs font-medium text-fg"
                  onclick={() => app.toggleTheme()}
                >
                  {#if app.theme === 'dark'}
                    <Sun class="h-3.5 w-3.5 text-warn" />
                    <span>Light Mode</span>
                  {:else}
                    <Moon class="h-3.5 w-3.5 text-muted" />
                    <span>Dark Mode</span>
                  {/if}
                </button>
                <button
                  type="button"
                  class="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 py-2 text-xs font-medium text-fg"
                  onclick={() => app.toggleSound()}
                >
                  {#if app.soundEnabled}
                    <Volume2 class="h-3.5 w-3.5 text-ok" />
                    <span>Sound On</span>
                  {:else}
                    <VolumeX class="h-3.5 w-3.5 text-dim" />
                    <span>Sound Off</span>
                  {/if}
                </button>
              </div>
              {#if canShowInstall}
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-fg hover:bg-raised"
                  onclick={() => { menuOpen = false; install(); }}
                >
                  <Download class="h-3.5 w-3.5 text-muted" />
                  <span>Install App on Phone</span>
                </button>
              {/if}
              <a
                href="transfer_receiver.html"
                class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-fg hover:bg-raised md:hidden"
                onclick={() => (menuOpen = false)}
              >
                <PackageCheck class="h-3.5 w-3.5 text-muted" />
                <span>Size Receiver (Transfer Split)</span>
              </a>
              <button
                type="button"
                class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-fg hover:bg-raised"
                onclick={() => { menuOpen = false; app.staffManagerOpen = true; }}
              >
                <Users class="h-3.5 w-3.5 text-muted" />
                <span>Manage staff accounts</span>
              </button>
              <button
                type="button"
                class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-fg hover:bg-raised"
                onclick={openReset}
              >
                <KeyRound class="h-3.5 w-3.5 text-muted" />
                <span>Reset password</span>
              </button>
              <button
                type="button"
                class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-bad hover:bg-raised"
                onclick={() => { menuOpen = false; app.logout(); }}
              >
                <LogOut class="h-3.5 w-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</header>

{#if iosInstallOpen}
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-xs sm:items-center sm:p-4">
    <div class="card w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl">
      <div class="flex items-center justify-between border-b border-line pb-3">
        <div class="flex items-center gap-2.5">
          <div class="grid h-9 w-9 place-items-center rounded-lg bg-fg text-bg">
            <Smartphone class="h-5 w-5" />
          </div>
          <div>
            <h3 class="text-sm font-bold text-fg">Install on iPhone / iPad</h3>
            <p class="text-xs text-muted">Apple Safari requires 2 quick taps to install:</p>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick={() => (iosInstallOpen = false)}>
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="mt-4 space-y-3 text-xs text-fg">
        <div class="flex items-start gap-3 rounded-xl border border-line bg-raised p-3">
          <div class="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-fg font-mono text-xs font-bold text-bg">1</div>
          <div>
            <div class="font-semibold">Tap the Safari "Share" button</div>
            <p class="mt-0.5 text-muted">
              At the bottom of your iPhone Safari screen, tap the <b class="text-fg">Share</b> icon
              (<Share class="inline h-3.5 w-3.5 text-fg" /> square with upward arrow).
            </p>
          </div>
        </div>

        <div class="flex items-start gap-3 rounded-xl border border-line bg-raised p-3">
          <div class="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-fg font-mono text-xs font-bold text-bg">2</div>
          <div>
            <div class="font-semibold">Select "Add to Home Screen"</div>
            <p class="mt-0.5 text-muted">
              Scroll down the menu and tap <b class="text-fg">Add to Home Screen</b>
              (<PlusSquare class="inline h-3.5 w-3.5 text-fg" />), then tap <b class="text-fg">Add</b> in the top-right corner.
            </p>
          </div>
        </div>
      </div>

      <div class="mt-4 flex justify-end">
        <button class="btn btn-primary w-full sm:w-auto" onclick={() => (iosInstallOpen = false)}>Got it</button>
      </div>
    </div>
  </div>
{/if}
