<script lang="ts">
  import { app, type HubTab } from '../lib/app.svelte';
  import {
    Boxes, ArrowLeftRight, History, PackageSearch, PackageCheck, Zap, RefreshCw, Sun, Moon, Volume2, VolumeX,
    Download, User, ChevronDown, Users, KeyRound, LogOut,
  } from 'lucide-svelte';

  let menuOpen = $state(false);

  const tabs: { id: HubTab; label: string; icon: any }[] = [
    { id: 'transfer', label: 'New Transfer', icon: ArrowLeftRight },
    { id: 'reorder', label: 'Stock & Reorder', icon: PackageSearch },
    { id: 'history', label: 'Transfer History', icon: History },
  ];

  async function install() {
    const p = app.deferredPwaPrompt;
    if (!p) return;
    p.prompt();
    await p.userChoice;
    app.deferredPwaPrompt = null;
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
</script>

<svelte:window onclick={() => (menuOpen = false)} />

<header class="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
  <div class="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 md:px-6">
    <div class="flex items-center gap-2.5">
      <div class="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white"><Boxes class="h-4 w-4" /></div>
      <div class="leading-tight">
        <div class="font-display text-[15px] font-semibold tracking-tight">
          Fashion<span class="text-accent">Feet</span>
        </div>
        <div class="hidden text-[10px] uppercase tracking-widest text-dim sm:block">Stock Hub</div>
      </div>
    </div>

    <nav class="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary">
      {#each tabs as t}
        {@const Icon = t.icon}
        <button
          class="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition
            {app.tab === t.id ? 'bg-raised text-fg ring-1 ring-line' : 'text-muted hover:bg-raised/60 hover:text-fg'}"
          onclick={() => (app.tab = t.id)}
          aria-current={app.tab === t.id ? 'page' : undefined}
        >
          <Icon class="h-4 w-4" />{t.label}
        </button>
      {/each}
      <a
        href="transfer_receiver.html"
        class="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-raised/60 hover:text-fg"
        title="Open Transfer Receiver to split generic sizes"
      >
        <PackageCheck class="h-4 w-4" />Size Receiver
      </a>
    </nav>

    <div class="ml-auto flex items-center gap-1.5">
      <div class="mr-1 hidden items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted lg:flex" title="Live Supabase Cloud POS Status">
        <span class="h-2 w-2 rounded-full {dot}"></span>{app.connText}
      </div>

      {#if app.deferredPwaPrompt}
        <button class="btn btn-sm hidden sm:inline-flex" onclick={install}><Download class="h-3.5 w-3.5" />Install</button>
      {/if}

      <button
        class="btn btn-sm {app.autoScan ? 'border-accent/50 text-accent' : ''}"
        onclick={() => (app.autoScan = !app.autoScan)}
        title="Toggle auto-add when scanning barcodes"
        aria-pressed={app.autoScan}
      >
        <Zap class="h-3.5 w-3.5" /><span class="hidden sm:inline">Instant Scan: {app.autoScan ? 'ON' : 'OFF'}</span>
      </button>

      <button class="btn btn-ghost btn-sm" onclick={() => app.syncCatalogAndStock()} title="Refresh catalog & stock" aria-label="Refresh catalog and stock">
        <RefreshCw class="h-4 w-4 {app.isSyncing ? 'animate-spin' : ''}" />
      </button>
      <button class="btn btn-ghost btn-sm" onclick={() => app.toggleTheme()} title="Switch theme" aria-label="Switch theme">
        {#if app.theme === 'dark'}<Sun class="h-4 w-4" />{:else}<Moon class="h-4 w-4" />{/if}
      </button>
      <button class="btn btn-ghost btn-sm" onclick={() => app.toggleSound()} title="Sound effects" aria-label="Toggle sound">
        {#if app.soundEnabled}<Volume2 class="h-4 w-4" />{:else}<VolumeX class="h-4 w-4 text-dim" />{/if}
      </button>

      <div class="relative">
        <button
          class="btn btn-sm gap-2"
          onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; }}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <User class="h-4 w-4" />
          <span class="hidden text-left leading-tight sm:block">
            <span class="block max-w-[110px] truncate text-xs font-semibold">{app.currentUser?.name ?? 'Sign in'}</span>
            <span class="block text-[10px] uppercase text-dim">{app.currentUser?.role ?? ''}</span>
          </span>
          <ChevronDown class="h-3.5 w-3.5 text-dim" />
        </button>
        {#if menuOpen}
          <div class="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-xl shadow-black/30" role="menu" onclick={(e) => e.stopPropagation()}>
            <div class="border-b border-line px-4 py-3">
              <div class="text-sm font-semibold">{app.currentUser?.name ?? 'Not signed in'}</div>
              <div class="truncate text-xs text-dim">{app.currentUser?.email ?? 'Please log in to continue'}</div>
            </div>
            <div class="p-1.5">
              <button class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-raised" onclick={() => { menuOpen = false; app.staffManagerOpen = true; }}>
                <Users class="h-4 w-4 text-muted" />Manage staff accounts
              </button>
              <button class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-raised" onclick={openReset}>
                <KeyRound class="h-4 w-4 text-muted" />Reset password
              </button>
              <button class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-bad hover:bg-raised" onclick={() => { menuOpen = false; app.logout(); }}>
                <LogOut class="h-4 w-4" />Sign out
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</header>
