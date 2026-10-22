<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    Glasses, X, RefreshCw, Sparkles, Store, ShoppingBag, MessageCircle,
    Info, Sliders, CheckCircle2, ChevronRight, Share2, Footprints, AlertCircle,
  } from 'lucide-svelte';
  import { app, fmtMoney } from '../../lib/app.svelte';
  import {
    calculateShoeSize,
    findInStockShoesForSize,
    buildSizingWhatsAppText,
    type SizingGender,
    type SizingFit,
    type SizingResult,
  } from './arLogic';
  import { WebXRMeasureManager } from './WebXRManager';

  // ---------------- state ----------------
  let isXrSupported = $state<boolean | null>(null);
  let xrBusy = $state(false);
  let inAr = $state(false);
  let xrError = $state<string | null>(null);

  let gender = $state<SizingGender>('men');
  let fit = $state<SizingFit>('regular');
  let manualLengthCm = $state(25.5);
  let measuredLengthCm = $state<number | null>(null);

  // AR Guidance State
  let floorDetected = $state(false);
  let pointPlaced = $state<0 | 1 | 2>(0);
  let showStockDrawer = $state(false);
  let customerName = $state('');

  let overlayEl: HTMLDivElement | undefined = $state();
  let xrManager: WebXRMeasureManager | null = null;

  // ---------------- Sizing Calculations ----------------
  const activeLengthCm = $derived(measuredLengthCm !== null ? measuredLengthCm : manualLengthCm);
  const sizingResult = $derived<SizingResult>(calculateShoeSize(activeLengthCm, gender, fit));

  const activeLocId = $derived(app.currentUser?.location_id || app.fromId || (app.locations[0]?.id ?? ''));
  const activeLocName = $derived(app.locations.find((l) => l.id === activeLocId)?.name || 'Branch');

  const inStockShoes = $derived(
    findInStockShoesForSize(
      app.catalog,
      app.stockMap,
      activeLocId,
      sizingResult.ukSize,
      sizingResult.euSize,
      gender,
    ),
  );

  // ---------------- WebXR Actions ----------------
  async function checkSupport() {
    isXrSupported = await WebXRMeasureManager.isSupported();
  }

  async function startArSession() {
    if (!overlayEl) return;
    xrBusy = true;
    xrError = null;
    floorDetected = false;
    pointPlaced = 0;
    measuredLengthCm = null;

    xrManager = new WebXRMeasureManager({
      onFloorDetected: (detected) => {
        floorDetected = detected;
      },
      onPointPlaced: (idx) => {
        pointPlaced = idx;
      },
      onMeasured: (lengthCm) => {
        measuredLengthCm = lengthCm;
        pointPlaced = 2;
      },
      onSessionEnded: () => {
        inAr = false;
        xrBusy = false;
      },
      onError: (msg) => {
        if (msg.toLowerCase().includes('not supported') || msg.toLowerCase().includes('configuration')) {
          isXrSupported = false;
          xrError = null;
        } else {
          xrError = msg;
        }
        inAr = false;
        xrBusy = false;
      },
    });

    try {
      inAr = true;
      await xrManager.start(overlayEl);
    } catch (e: any) {
      const msg = e.message || 'Failed to start AR';
      if (msg.toLowerCase().includes('not supported') || msg.toLowerCase().includes('configuration')) {
        isXrSupported = false;
        xrError = null;
      } else {
        xrError = msg;
      }
      inAr = false;
    } finally {
      xrBusy = false;
    }
  }

  function resetArMeasurement() {
    if (xrManager) {
      xrManager.resetMeasurement();
      pointPlaced = 0;
      measuredLengthCm = null;
    }
  }

  function stopArSession() {
    if (xrManager) {
      xrManager.stop();
      xrManager = null;
    }
    inAr = false;
  }

  function shareViaWhatsApp() {
    const text = buildSizingWhatsAppText(sizingResult, activeLocName, customerName);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  function copySlip() {
    const text = buildSizingWhatsAppText(sizingResult, activeLocName, customerName);
    navigator.clipboard.writeText(text);
    app.toast('✓ 3D AR Size report copied!', 'success');
  }

  onMount(() => {
    checkSupport();
  });

  onDestroy(() => {
    stopArSession();
  });
</script>

<!-- Outer Container (Acts as both standard modal & WebXR DOM Overlay root) -->
<div
  bind:this={overlayEl}
  class="{inAr ? 'fixed inset-0 z-50 pointer-events-auto bg-transparent' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto'}"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  {#if inAr}
    <!-- ---------------- IN-AR DOM OVERLAY (Floating over Camera) ---------------- -->
    <div class="pointer-events-none flex h-full w-full flex-col justify-between p-3 sm:p-5">
      <!-- Top AR Navigation Bar -->
      <div class="pointer-events-auto flex items-center justify-between gap-2 rounded-2xl bg-black/75 p-2.5 backdrop-blur-md border border-white/20 shadow-2xl">
        <!-- Gender selector -->
        <div class="flex rounded-lg bg-white/10 p-0.5 text-xs font-semibold">
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-white {gender === 'men' ? 'bg-accent font-bold text-bg' : 'opacity-80'}"
            onclick={() => (gender = 'men')}
          >
            👨 Men
          </button>
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-white {gender === 'women' ? 'bg-accent font-bold text-bg' : 'opacity-80'}"
            onclick={() => (gender = 'women')}
          >
            👩 Women
          </button>
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-white {gender === 'kids' ? 'bg-accent font-bold text-bg' : 'opacity-80'}"
            onclick={() => (gender = 'kids')}
          >
            🧒 Kids
          </button>
        </div>

        <!-- Exit AR button -->
        <button
          type="button"
          class="flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-md active:scale-95"
          onclick={stopArSession}
        >
          <X class="h-4 w-4" />
          <span>Exit AR</span>
        </button>
      </div>

      <!-- Center Dynamic AR Step Instructions -->
      <div class="self-center text-center max-w-sm">
        <div class="inline-block rounded-2xl bg-black/85 px-4 py-2.5 text-xs font-bold text-white shadow-2xl border border-white/20 backdrop-blur-md">
          {#if !floorDetected}
            <div class="flex items-center gap-2 text-amber-400">
              <span class="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
              <span>බිම දෙසට Camera එක සෙමෙන් අල්ලන්න (Detecting Floor)...</span>
            </div>
          {:else if pointPlaced === 0}
            <div class="text-emerald-400">
              🦶 1. විලුඹ (Heel) මත රවුම තබා Screen එක Touch කරන්න
            </div>
          {:else if pointPlaced === 1}
            <div class="text-sky-400">
              🦶 2. දිගම ඇඟිල්ල (Toe) මත රවුම තබා Screen එක Touch කරන්න
            </div>
          {:else}
            <div class="text-emerald-400 flex items-center gap-1.5 justify-center">
              <CheckCircle2 class="h-4 w-4" />
              <span>මැනීම සාර්ථකයි! දිග: {measuredLengthCm} cm</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Bottom Floating Sizing Card & Results (in AR) -->
      <div class="pointer-events-auto rounded-2xl border border-white/20 bg-black/90 p-4 backdrop-blur-xl text-white shadow-2xl space-y-3 max-w-lg mx-auto w-full">
        <div class="flex items-center justify-between border-b border-white/10 pb-2">
          <div class="flex items-center gap-2">
            <Sparkles class="h-4 w-4 text-accent" />
            <span class="text-xs font-bold text-white">Recommended Shoe Size</span>
          </div>
          <span class="font-mono text-xs text-white/80 font-bold">
            Foot: {sizingResult.rawLengthCm} cm
          </span>
        </div>

        <!-- 3 Badges -->
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="rounded-xl border border-accent/60 bg-accent/20 p-2">
            <div class="text-[10px] font-bold text-accent uppercase">UK / SL</div>
            <div class="font-mono text-2xl font-black text-accent mt-0.5">UK {sizingResult.ukSize}</div>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-2">
            <div class="text-[10px] font-bold text-white/70 uppercase">Europe</div>
            <div class="font-mono text-xl font-black text-white mt-0.5">{sizingResult.euSize}</div>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-2">
            <div class="text-[10px] font-bold text-white/70 uppercase">US Size</div>
            <div class="font-mono text-xl font-black text-white mt-0.5">{sizingResult.usSize}</div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-2 pt-1 flex-wrap">
          {#if pointPlaced === 2}
            <button
              type="button"
              class="btn btn-sm flex-1 bg-white/10 hover:bg-white/20 text-white text-xs gap-1 border-white/20"
              onclick={resetArMeasurement}
            >
              <RefreshCw class="h-3 w-3" />
              <span>නැවත මනින්න</span>
            </button>
          {/if}

          <button
            type="button"
            class="btn btn-sm flex-1 bg-accent text-bg font-bold text-xs gap-1 border-0"
            onclick={() => (showStockDrawer = !showStockDrawer)}
          >
            <Store class="h-3.5 w-3.5" />
            <span>සපත්තු බලන්න ({inStockShoes.length})</span>
          </button>

          <button
            type="button"
            class="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1 border-0"
            onclick={shareViaWhatsApp}
          >
            <MessageCircle class="h-3.5 w-3.5" />
            <span>WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  {:else}
    <!-- ---------------- STANDARD MODAL VIEW (Launcher & Fallback) ---------------- -->
    <div
      class="relative flex max-h-[94vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-line bg-raised/50 px-4 py-3 shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="grid h-9 w-9 place-items-center rounded-xl bg-accent text-bg shadow-sm">
            <Footprints class="h-5 w-5" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-sm sm:text-base font-bold text-fg">3D AR Foot Measure</h2>
              <span class="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">WebXR</span>
            </div>
            <p class="text-[11px] text-muted">Android &amp; Samsung 3D Augmented Reality Caliper</p>
          </div>
        </div>

        <button
          type="button"
          class="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg"
          onclick={() => (app.arMeasureOpen = false)}
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {#if isXrSupported === true}
          <!-- Android / Samsung WebXR Ready Card -->
          <div class="rounded-2xl border-2 border-accent bg-accent/10 p-5 text-center space-y-3">
            <div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent text-bg shadow-md">
              <Glasses class="h-6 w-6" />
            </div>
            <div>
              <h3 class="text-base font-bold text-fg">3D WebXR AR Ready!</h3>
              <p class="text-xs text-muted max-w-md mx-auto mt-1">
                ඔබගේ Android / Samsung phone එකේ Google Chrome හරහා කිසිම Card එකක් නැතිව 3D AR වලින් කකුලේ දිග මැනිය හැක.
              </p>
            </div>

            <button
              type="button"
              class="btn btn-primary h-12 px-8 text-sm font-bold shadow-xl gap-2 hover:scale-105 active:scale-95 transition-all"
              onclick={startArSession}
              disabled={xrBusy}
            >
              <Glasses class="h-5 w-5" />
              <span>Start 3D AR Camera (මනින්න)</span>
            </button>
          </div>
        {:else if isXrSupported === false}
          <!-- Not supported notice (iPhone or non-AR device) -->
          <div class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-fg space-y-2">
            <div class="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
              <AlertCircle class="h-4 w-4 shrink-0" />
              <span>WebXR 3D AR සහය නොදක්වයි (iPhone / Incompatible Device)</span>
            </div>
            <p class="text-muted leading-relaxed">
              Google WebXR 3D AR ක්‍රියාත්මක වන්නේ <b>Google Chrome</b> සහිත <b>Android / Samsung</b> Phones වල පමණි.
              <br />
              ඔබ ළඟ <b>iPhone 13 mini</b> එකක් ඇත්නම්, එහි එන <b>Apple Measure</b> app එකෙන් කකුල මැන, පහත ඇති Slider එකට cm දිග ලබාදෙන්න.
            </p>
          </div>
        {/if}

        {#if xrError}
          <div class="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-fg space-y-1.5">
            <div class="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
              <AlertCircle class="h-4 w-4 shrink-0" />
              <span>3D AR Camera එක මෙම Phone එකේ සක්‍රීය නැත</span>
            </div>
            <p class="text-muted leading-relaxed">
              Google WebXR 3D AR ක්‍රියාත්මක වීමට Android Phone එකෙහි <b>Google Play Services for AR (ARCore)</b> ස්ථාපනය කර තිබිය යුතුය.
              <br />
              ඔබ iPhone එකක් භාවිත කරන්නේ නම්, එහි එන <b>Apple Measure</b> app එකෙන් කකුල මැන, පහත ඇති Slider එකට අගය ලබා දෙන්න.
            </p>
          </div>
        {/if}

        <!-- ---------------- QUICK SIZE CALCULATOR & CONVERTER ---------------- -->
        <div class="rounded-2xl border border-line bg-raised/30 p-4 space-y-4">
          <!-- Category Selector -->
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <span class="text-xs font-bold text-muted">Category:</span>
            <div class="flex rounded-lg border border-line bg-surface p-0.5 text-xs font-medium">
              <button
                type="button"
                class="rounded-md px-3 py-1 transition-all {gender === 'men' ? 'bg-accent text-bg font-bold' : 'text-muted'}"
                onclick={() => (gender = 'men')}
              >
                👨 Men (පිරිමි)
              </button>
              <button
                type="button"
                class="rounded-md px-3 py-1 transition-all {gender === 'women' ? 'bg-accent text-bg font-bold' : 'text-muted'}"
                onclick={() => (gender = 'women')}
              >
                👩 Women (කාන්තා)
              </button>
              <button
                type="button"
                class="rounded-md px-3 py-1 transition-all {gender === 'kids' ? 'bg-accent text-bg font-bold' : 'text-muted'}"
                onclick={() => (gender = 'kids')}
              >
                🧒 Kids (ළමුන්)
              </button>
            </div>
          </div>

          <!-- Slider -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-fg">Foot Length (කකුලේ දිග):</span>
              <span class="font-mono text-xl font-black text-accent">{manualLengthCm.toFixed(1)} cm</span>
            </div>
            <input
              type="range"
              min="12.0"
              max="34.0"
              step="0.1"
              bind:value={manualLengthCm}
              class="w-full h-3 bg-surface rounded-lg appearance-none cursor-pointer accent-accent"
            />
          </div>

          <!-- Presets -->
          <div class="flex items-center justify-center gap-1.5 flex-wrap pt-1">
            {#each [24.0, 25.0, 25.5, 26.0, 26.5, 27.0, 27.5, 28.0] as p}
              <button
                type="button"
                class="rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-xs font-bold {manualLengthCm === p ? 'border-accent text-accent' : 'text-muted'}"
                onclick={() => (manualLengthCm = p)}
              >
                {p}
              </button>
            {/each}
          </div>
        </div>

        <!-- Live Size Results -->
        <div class="rounded-2xl border-2 border-accent/40 bg-gradient-to-br from-accent/5 to-surface p-4 space-y-3">
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-xl border border-accent/50 bg-surface p-3 shadow-sm">
              <span class="text-[10px] font-bold uppercase text-accent">🇬🇧 UK / Sri Lanka</span>
              <span class="font-mono text-3xl font-black text-accent mt-0.5 block">UK {sizingResult.ukSize}</span>
              <span class="text-[10px] text-muted">නියමිත ප්‍රමාණය</span>
            </div>
            <div class="rounded-xl border border-line bg-surface p-3 shadow-xs">
              <span class="text-[10px] font-bold uppercase text-muted">🇪🇺 Europe</span>
              <span class="font-mono text-2xl font-black text-fg mt-0.5 block">{sizingResult.euSize}</span>
              <span class="text-[10px] text-dim">EU Size</span>
            </div>
            <div class="rounded-xl border border-line bg-surface p-3 shadow-xs">
              <span class="text-[10px] font-bold uppercase text-muted">🇺🇸 US Size</span>
              <span class="font-mono text-2xl font-black text-fg mt-0.5 block">{sizingResult.usSize}</span>
              <span class="text-[10px] text-dim">US Size</span>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              class="btn btn-primary h-10 flex-1 text-xs font-bold gap-1.5"
              onclick={() => (showStockDrawer = !showStockDrawer)}
            >
              <Store class="h-4 w-4" />
              <span>{showStockDrawer ? 'Hide Shoes' : `View Shoes in UK ${sizingResult.ukSize} (${inStockShoes.length})`}</span>
            </button>
            <button
              type="button"
              class="btn h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 border-0 px-4"
              onclick={shareViaWhatsApp}
            >
              <MessageCircle class="h-4 w-4" />
              <span>WhatsApp</span>
            </button>
          </div>
        </div>

        <!-- In Stock Shoes List -->
        {#if showStockDrawer}
          <div class="rounded-2xl border border-line bg-surface p-3 space-y-2">
            <div class="flex items-center justify-between border-b border-line pb-2">
              <span class="text-xs font-bold text-fg">In-Stock at {activeLocName}:</span>
              <span class="chip text-[10px] text-ok font-bold">{inStockShoes.length} models</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
              {#each inStockShoes as { variant, stock }}
                <div class="flex items-center justify-between p-2 rounded-xl border border-line bg-raised/40 text-xs">
                  <div>
                    <div class="font-bold text-fg truncate">{variant.products?.name || variant.sku}</div>
                    <div class="text-[10px] text-muted">{variant.products?.brand || ''} • Size {variant.size}</div>
                  </div>
                  <div class="text-right">
                    <div class="font-mono font-bold text-fg">{fmtMoney(variant.selling_price)}</div>
                    <span class="text-[10px] text-ok font-semibold">{stock} pairs</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end border-t border-line bg-raised/50 px-4 py-2.5">
        <button
          type="button"
          class="btn btn-sm px-5 font-bold"
          onclick={() => (app.arMeasureOpen = false)}
        >
          Done (අවසන්)
        </button>
      </div>
    </div>
  {/if}
</div>
