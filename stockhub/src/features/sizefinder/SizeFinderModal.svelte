<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    Camera, RefreshCw, X, Check, Share2, Ruler, Smartphone, Sparkles,
    Layers, Sliders, ArrowLeft, Store, Info, Zap, ZapOff, CheckCircle2,
    ShoppingBag, ChevronRight, MessageCircle, Footprints, ExternalLink,
  } from 'lucide-svelte';
  import { app, fmtMoney, getShoeDisplaySize } from '../../lib/app.svelte';
  import {
    calculateShoeSize,
    findInStockShoesForSize,
    buildSizingWhatsAppText,
    REFERENCE_OBJECTS,
    type SizingGender,
    type SizingFit,
    type SizingReferenceType,
    type SizingResult,
  } from './logic';

  // ---------------- state ----------------
  let mode = $state<'camera' | 'manual'>('camera');
  let gender = $state<SizingGender>('men');
  let fit = $state<SizingFit>('regular');
  let refType = $state<SizingReferenceType>('card');

  // Manual Slider state
  let manualLengthCm = $state(25.5);

  // Camera & Image state
  let videoEl: HTMLVideoElement | undefined = $state();
  let canvasEl: HTMLCanvasElement | undefined = $state();
  let stream: MediaStream | null = null;
  let cameraActive = $state(false);
  let cameraError = $state<string | null>(null);
  let torchOn = $state(false);
  let hasTorch = $state(false);
  let captured = $state(false);
  let photoDataUrl = $state<string | null>(null);
  let containerEl: HTMLDivElement | undefined = $state();

  // Screen / Coordinate geometry
  let imgWidth = $state(600);
  let imgHeight = $state(800);

  // Pin points (normalized coordinates 0.0 - 1.0)
  // Card reference (C1, C2)
  let c1 = $state({ x: 0.15, y: 0.35 });
  let c2 = $state({ x: 0.15, y: 0.65 });

  // Foot measurement (A = Heel, B = Toe)
  let pA = $state({ x: 0.55, y: 0.78 }); // Heel
  let pB = $state({ x: 0.55, y: 0.22 }); // Toe

  // Dragging interaction state
  type DragHandle = 'c1' | 'c2' | 'pA' | 'pB' | null;
  let activeHandle = $state<DragHandle>(null);

  // In-Stock Shoes Drawer state
  let showStockDrawer = $state(false);
  let customerName = $state('');

  // ---------------- Derived Calculations ----------------
  // Real world length in cm
  const refObj = $derived(REFERENCE_OBJECTS[refType]);

  const cameraMeasuredLengthCm = $derived.by(() => {
    // Pixel distance of reference card
    const dxCard = (c2.x - c1.x) * imgWidth;
    const dyCard = (c2.y - c1.y) * imgHeight;
    const cardPx = Math.hypot(dxCard, dyCard);

    if (cardPx < 5) return 25.5; // Avoid div by zero
    const cmPerPx = refObj.lengthCm / cardPx;

    // Pixel distance of foot
    const dxFoot = (pB.x - pA.x) * imgWidth;
    const dyFoot = (pB.y - pA.y) * imgHeight;
    const footPx = Math.hypot(dxFoot, dyFoot);

    const length = footPx * cmPerPx;
    return Math.max(10, Math.min(36, Number(length.toFixed(1))));
  });

  const activeLengthCm = $derived(mode === 'camera' && captured ? cameraMeasuredLengthCm : manualLengthCm);

  const sizingResult = $derived<SizingResult>(calculateShoeSize(activeLengthCm, gender, fit));

  // In-stock shoes at active branch
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

  // ---------------- Camera Lifecycle ----------------
  async function startCamera() {
    cameraError = null;
    captured = false;
    photoDataUrl = null;
    torchOn = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      cameraError = 'Camera access is not supported on this browser/device.';
      mode = 'manual';
      return;
    }

    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      if (videoEl) {
        videoEl.srcObject = stream;
        await videoEl.play();
        cameraActive = true;
      }

      // Check torch capability
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? (track.getCapabilities() as any) : {};
      hasTorch = Boolean(capabilities.torch);
    } catch (err: any) {
      console.warn('Camera failed:', err);
      cameraError = 'Could not start camera: ' + (err.message || 'Permission denied');
      mode = 'manual';
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    cameraActive = false;
  }

  async function toggleTorch() {
    if (!stream || !hasTorch) return;
    try {
      const track = stream.getVideoTracks()[0];
      torchOn = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: torchOn }],
      });
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  }

  function capturePhoto() {
    if (!videoEl || !canvasEl) return;
    const vWidth = videoEl.videoWidth || 640;
    const vHeight = videoEl.videoHeight || 480;

    canvasEl.width = vWidth;
    canvasEl.height = vHeight;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(videoEl, 0, 0, vWidth, vHeight);
    photoDataUrl = canvasEl.toDataURL('image/jpeg', 0.92);
    captured = true;

    // Set geometry dimensions for pins
    if (containerEl) {
      const rect = containerEl.getBoundingClientRect();
      imgWidth = rect.width || vWidth;
      imgHeight = rect.height || vHeight;
    }

    // Default pin placement
    // Card on left side
    c1 = { x: 0.2, y: 0.4 };
    c2 = { x: 0.2, y: 0.65 };
    // Foot in center
    pA = { x: 0.58, y: 0.78 }; // Heel
    pB = { x: 0.58, y: 0.22 }; // Toe

    stopCamera();
  }

  function retake() {
    captured = false;
    photoDataUrl = null;
    startCamera();
  }

  // ---------------- Touch & Drag Pin Handlers ----------------
  function handlePointerDown(handle: DragHandle, e: MouseEvent | TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    activeHandle = handle;
  }

  function handlePointerMove(e: MouseEvent | TouchEvent) {
    if (!activeHandle || !containerEl) return;
    e.preventDefault();

    const rect = containerEl.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const normX = Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width));
    const normY = Math.max(0.02, Math.min(0.98, (clientY - rect.top) / rect.height));

    if (activeHandle === 'c1') c1 = { x: normX, y: normY };
    else if (activeHandle === 'c2') c2 = { x: normX, y: normY };
    else if (activeHandle === 'pA') pA = { x: normX, y: normY };
    else if (activeHandle === 'pB') pB = { x: normX, y: normY };
  }

  function handlePointerUp() {
    activeHandle = null;
  }

  function handleContainerClick(e: MouseEvent) {
    // If not dragging, allow fast tap placement
    if (activeHandle || !containerEl || !captured) return;
    const rect = containerEl.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;

    // Find nearest pin to jump to tap
    const distPA = Math.hypot(normX - pA.x, normY - pA.y);
    const distPB = Math.hypot(normX - pB.x, normY - pB.y);
    const distC1 = Math.hypot(normX - c1.x, normY - c1.y);
    const distC2 = Math.hypot(normX - c2.x, normY - c2.y);

    const min = Math.min(distPA, distPB, distC1, distC2);
    if (min === distPB) pB = { x: normX, y: normY };
    else if (min === distPA) pA = { x: normX, y: normY };
    else if (min === distC2) c2 = { x: normX, y: normY };
    else c1 = { x: normX, y: normY };
  }

  // ---------------- Share Actions ----------------
  function shareViaWhatsApp() {
    const text = buildSizingWhatsAppText(sizingResult, activeLocName, customerName);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  function copySlipToClipboard() {
    const text = buildSizingWhatsAppText(sizingResult, activeLocName, customerName);
    navigator.clipboard.writeText(text);
    app.toast('✓ Size report copied to clipboard!', 'success');
  }

  // ---------------- Lifecycle ----------------
  onMount(() => {
    if (mode === 'camera') {
      startCamera();
    }
  });

  onDestroy(() => {
    stopCamera();
  });
</script>

<!-- Outer Backdrop Modal -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  onclick={(e) => {
    if (e.target === e.currentTarget) {
      stopCamera();
      app.sizeFinderOpen = false;
    }
  }}
>
  <div
    class="relative flex max-h-[96vh] w-full max-w-3xl flex-col rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Modal Header -->
    <div class="flex items-center justify-between border-b border-line px-4 py-3 bg-raised/50 shrink-0">
      <div class="flex items-center gap-2.5">
        <div class="grid h-9 w-9 place-items-center rounded-xl bg-accent text-bg shadow-sm">
          <Footprints class="h-5 w-5" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-sm sm:text-base font-bold text-fg">Smart Foot Size Finder</h2>
            <span class="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">AR Caliper</span>
          </div>
          <p class="text-[11px] text-muted">පාවහන් ප්‍රමාණ මනින මාපකය — UK / EU / US</p>
        </div>
      </div>

      <div class="flex items-center gap-1.5">
        <!-- Mode switcher tab pills -->
        <div class="flex rounded-lg border border-line bg-surface p-0.5 text-xs font-semibold">
          <button
            type="button"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 transition-all {mode === 'camera' ? 'bg-accent text-bg font-bold shadow-xs' : 'text-muted hover:text-fg'}"
            onclick={() => {
              mode = 'camera';
              if (!captured && !cameraActive) startCamera();
            }}
          >
            <Camera class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">Camera</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 transition-all {mode === 'manual' ? 'bg-accent text-bg font-bold shadow-xs' : 'text-muted hover:text-fg'}"
            onclick={() => {
              mode = 'manual';
              stopCamera();
            }}
          >
            <Sliders class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">Manual Slider</span>
          </button>
        </div>

        <button
          type="button"
          class="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg"
          onclick={() => {
            stopCamera();
            app.sizeFinderOpen = false;
          }}
          aria-label="Close"
        >
          <X class="h-5 w-5" />
        </button>
      </div>
    </div>

    <!-- Gender & Fit Filter Bar -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2 text-xs shrink-0">
      <!-- Gender selector -->
      <div class="flex items-center gap-1">
        <span class="font-bold text-muted mr-1">Category:</span>
        <div class="flex rounded-lg border border-line bg-raised/60 p-0.5 font-medium">
          <button
            type="button"
            class="rounded-md px-2.5 py-1 transition-all {gender === 'men' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-fg'}"
            onclick={() => (gender = 'men')}
          >
            👨 Men (පිරිමි)
          </button>
          <button
            type="button"
            class="rounded-md px-2.5 py-1 transition-all {gender === 'women' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-fg'}"
            onclick={() => (gender = 'women')}
          >
            👩 Women (කාන්තා)
          </button>
          <button
            type="button"
            class="rounded-md px-2.5 py-1 transition-all {gender === 'kids' ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-fg'}"
            onclick={() => (gender = 'kids')}
          >
            🧒 Kids (ළමුන්)
          </button>
        </div>
      </div>

      <!-- Fit comfort toggle -->
      <div class="flex items-center gap-1">
        <span class="font-bold text-muted mr-1">Fit:</span>
        <div class="flex rounded-lg border border-line bg-raised/60 p-0.5 text-[11px]">
          <button
            type="button"
            class="rounded-md px-2 py-0.5 {fit === 'tight' ? 'bg-fg text-bg font-bold' : 'text-muted'}"
            onclick={() => (fit = 'tight')}
            title="Snug fit (+3mm room)"
          >
            Snug (හිරට)
          </button>
          <button
            type="button"
            class="rounded-md px-2 py-0.5 {fit === 'regular' ? 'bg-accent text-bg font-bold' : 'text-muted'}"
            onclick={() => (fit = 'regular')}
            title="Recommended standard fit (+6mm toe room)"
          >
            Regular (සුවපහසු)
          </button>
          <button
            type="button"
            class="rounded-md px-2 py-0.5 {fit === 'wide' ? 'bg-fg text-bg font-bold' : 'text-muted'}"
            onclick={() => (fit = 'wide')}
            title="Room for thick socks / wide feet (+10mm)"
          >
            Wide / Socks
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Body (Scrollable) -->
    <div class="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
      <!-- ---------------- MODE 1: CAMERA AR CALIPER ---------------- -->
      {#if mode === 'camera'}
        <div class="space-y-3">
          <!-- Reference Object Select -->
          <div class="flex items-center justify-between gap-2 text-xs bg-raised/40 border border-line rounded-xl p-2.5">
            <div class="flex items-center gap-2">
              <span class="font-bold text-fg">Reference Marker (මිණුම් මිම්ම):</span>
              <select
                class="bg-surface border border-line rounded-lg px-2 py-1 text-xs font-semibold text-fg"
                bind:value={refType}
              >
                <option value="card">💳 ATM / Bank / NIC Card (8.56 cm)</option>
                <option value="a4">📄 A4 Paper Sheet (29.7 cm)</option>
                <option value="coin">🪙 Rs. 10 Coin (2.64 cm)</option>
              </select>
            </div>
            <div class="text-[11px] text-muted hidden sm:block">
              {refObj.description}
            </div>
          </div>

          <!-- Camera Live Video or Captured Interactive Canvas -->
          <div
            bind:this={containerEl}
            class="relative w-full aspect-[4/3] sm:aspect-[16/10] max-h-[460px] rounded-xl overflow-hidden bg-black border-2 border-line shadow-inner select-none touch-none cursor-crosshair"
            onpointermove={handlePointerMove}
            onpointerup={handlePointerUp}
            onclick={handleContainerClick}
          >
            {#if !captured}
              <!-- Live Video Stream -->
              <video
                bind:this={videoEl}
                class="h-full w-full object-cover"
                autoplay
                playsinline
                muted
              ></video>

              <!-- Helpful live camera guide overlay -->
              <div class="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 bg-gradient-to-b from-black/50 via-transparent to-black/60">
                <div class="flex items-center justify-between">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[11px] text-white border border-white/20">
                    <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Live Camera Feed
                  </span>
                  {#if hasTorch}
                    <button
                      type="button"
                      class="pointer-events-auto p-2 rounded-full bg-black/60 text-white hover:bg-black/90 border border-white/20 transition-all"
                      onclick={toggleTorch}
                      title="Toggle Flashlight"
                    >
                      {#if torchOn}
                        <Zap class="h-4 w-4 text-amber-400 fill-amber-400" />
                      {:else}
                        <ZapOff class="h-4 w-4" />
                      {/if}
                    </button>
                  {/if}
                </div>

                <!-- Center Alignment Box Guide -->
                <div class="self-center text-center">
                  <div class="inline-block px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-md border border-white/20 text-xs text-white shadow-lg">
                    📌 කකුල බිම තබා ඒ අසලින් <b>{refObj.name}</b> තබන්න. ඉන්පසු Capture කරන්න.
                  </div>
                </div>

                <!-- Shutter Action Bar -->
                <div class="flex items-center justify-center pb-2">
                  <button
                    type="button"
                    class="pointer-events-auto flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-bold text-bg shadow-xl hover:scale-105 active:scale-95 transition-all text-sm"
                    onclick={capturePhoto}
                  >
                    <Camera class="h-5 w-5" />
                    <span>📸 Capture Foot (මනින්න)</span>
                  </button>
                </div>
              </div>
            {:else}
              <!-- Captured Frame Image & Interactive Svg Overlay -->
              {#if photoDataUrl}
                <img
                  src={photoDataUrl}
                  alt="Captured Foot Frame"
                  class="absolute inset-0 h-full w-full object-cover pointer-events-none"
                />
              {/if}

              <!-- Interactive Caliper SVG Overlay -->
              <svg class="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                <!-- 1. Card Reference Line (Blue) -->
                <line
                  x1={c1.x * 100}
                  y1={c1.y * 100}
                  x2={c2.x * 100}
                  y2={c2.y * 100}
                  stroke="#38bdf8"
                  stroke-width="0.8"
                  stroke-dasharray="1.5, 1"
                />

                <!-- 2. Foot Caliper Line (Emerald Glowing) -->
                <line
                  x1={pA.x * 100}
                  y1={pA.y * 100}
                  x2={pB.x * 100}
                  y2={pB.y * 100}
                  stroke="#10b981"
                  stroke-width="1.2"
                />
              </svg>

              <!-- HTML Draggable Handle Pins -->
              <!-- Pin C1 (Card Start) -->
              <div
                class="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-30"
                style="left: {c1.x * 100}%; top: {c1.y * 100}%;"
                onpointerdown={(e) => handlePointerDown('c1', e)}
              >
                <div class="h-7 w-7 rounded-full bg-sky-500 border-2 border-white shadow-lg flex items-center justify-center text-[9px] font-black text-white hover:scale-125 transition-transform">
                  C1
                </div>
              </div>

              <!-- Pin C2 (Card End) -->
              <div
                class="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-30"
                style="left: {c2.x * 100}%; top: {c2.y * 100}%;"
                onpointerdown={(e) => handlePointerDown('c2', e)}
              >
                <div class="h-7 w-7 rounded-full bg-sky-500 border-2 border-white shadow-lg flex items-center justify-center text-[9px] font-black text-white hover:scale-125 transition-transform">
                  C2
                </div>
                <span class="absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-sky-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-md">
                  💳 {refObj.lengthCm} cm
                </span>
              </div>

              <!-- Pin A (Heel - විලුඹ) -->
              <div
                class="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-40"
                style="left: {pA.x * 100}%; top: {pA.y * 100}%;"
                onpointerdown={(e) => handlePointerDown('pA', e)}
              >
                <div class="h-9 w-9 rounded-full bg-emerald-600 border-2 border-white shadow-xl flex items-center justify-center text-xs font-black text-white ring-4 ring-emerald-500/30 hover:scale-125 transition-transform">
                  A
                </div>
                <span class="absolute top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-emerald-700/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
                  🦶 Heel (විලුඹ)
                </span>
              </div>

              <!-- Pin B (Toe - දිගම ඇඟිල්ල) -->
              <div
                class="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-40"
                style="left: {pB.x * 100}%; top: {pB.y * 100}%;"
                onpointerdown={(e) => handlePointerDown('pB', e)}
              >
                <div class="h-9 w-9 rounded-full bg-emerald-600 border-2 border-white shadow-xl flex items-center justify-center text-xs font-black text-white ring-4 ring-emerald-500/30 hover:scale-125 transition-transform">
                  B
                </div>
                <span class="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-emerald-700/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
                  🦶 Toe (ඇඟිල්ල)
                </span>
              </div>

              <!-- Center Floating Caliper Length Pill -->
              <div
                class="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20"
                style="left: {((pA.x + pB.x) / 2) * 100}%; top: {((pA.y + pB.y) / 2) * 100}%;"
              >
                <div class="flex items-center gap-1.5 rounded-full bg-black/85 backdrop-blur-md px-3 py-1 border border-emerald-500 text-xs font-black text-emerald-400 shadow-xl">
                  <Ruler class="h-3.5 w-3.5" />
                  <span>{cameraMeasuredLengthCm.toFixed(1)} cm</span>
                </div>
              </div>

              <!-- Top Retake Control Overlay -->
              <div class="absolute top-2 right-2 z-50">
                <button
                  type="button"
                  class="flex items-center gap-1.5 rounded-lg bg-black/75 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-white border border-white/20 hover:bg-black transition-all shadow-md"
                  onclick={retake}
                >
                  <RefreshCw class="h-3.5 w-3.5" />
                  <span>Retake Photo</span>
                </button>
              </div>

              <!-- Bottom Help Banner -->
              <div class="absolute bottom-2 left-2 right-2 pointer-events-none z-10">
                <div class="rounded-lg bg-black/75 backdrop-blur-md p-2 text-center text-[11px] text-white border border-white/10">
                  💡 <b>C1 & C2</b> Card එකේ දාරවලටත්, <b>A & B</b> කකුලේ විලුඹ සහ මහපටැඟිල්ලටත් Drag කරන්න (හෝ Touch කරන්න).
                </div>
              </div>
            {/if}
          </div>
          <canvas bind:this={canvasEl} class="hidden"></canvas>
        </div>
      {:else}
        <!-- ---------------- MODE 2: MANUAL SLIDER ---------------- -->
        <div class="rounded-2xl border border-line bg-raised/30 p-4 sm:p-6 space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-muted uppercase tracking-wider">
              Measured Foot Length (කකුලේ දිග):
            </span>
            <div class="flex items-center gap-2">
              <span class="font-mono text-2xl font-black text-fg">
                {manualLengthCm.toFixed(1)} <span class="text-sm font-semibold text-muted">cm</span>
              </span>
              <span class="font-mono text-sm text-dim">
                ({(manualLengthCm / 2.54).toFixed(1)}")
              </span>
            </div>
          </div>

          <!-- Slider Range -->
          <div class="space-y-2">
            <input
              type="range"
              min="12.0"
              max="34.0"
              step="0.1"
              bind:value={manualLengthCm}
              class="w-full h-3 bg-raised rounded-lg appearance-none cursor-pointer accent-accent"
            />
            <div class="flex justify-between text-[10px] font-mono text-dim">
              <span>12 cm (Kids)</span>
              <span>20 cm</span>
              <span>25 cm (Men 7)</span>
              <span>28 cm (Men 10)</span>
              <span>34 cm</span>
            </div>
          </div>

          <!-- Quick Increment Buttons -->
          <div class="flex items-center justify-center gap-2 pt-1 flex-wrap">
            <button
              type="button"
              class="btn btn-sm px-3 text-xs"
              onclick={() => (manualLengthCm = Math.max(12, Number((manualLengthCm - 0.5).toFixed(1))))}
            >
              -0.5 cm
            </button>
            <button
              type="button"
              class="btn btn-sm px-3 text-xs"
              onclick={() => (manualLengthCm = Math.max(12, Number((manualLengthCm - 0.1).toFixed(1))))}
            >
              -0.1 cm
            </button>
            {#each [24.0, 25.0, 25.5, 26.0, 26.5, 27.0, 28.0] as preset}
              <button
                type="button"
                class="rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs font-bold hover:border-fg/40 {manualLengthCm === preset ? 'border-accent text-accent' : 'text-muted'}"
                onclick={() => (manualLengthCm = preset)}
              >
                {preset} cm
              </button>
            {/each}
            <button
              type="button"
              class="btn btn-sm px-3 text-xs"
              onclick={() => (manualLengthCm = Math.min(34, Number((manualLengthCm + 0.1).toFixed(1))))}
            >
              +0.1 cm
            </button>
            <button
              type="button"
              class="btn btn-sm px-3 text-xs"
              onclick={() => (manualLengthCm = Math.min(34, Number((manualLengthCm + 0.5).toFixed(1))))}
            >
              +0.5 cm
            </button>
          </div>
        </div>
      {/if}

      <!-- ---------------- LIVE RESULTS CARD ---------------- -->
      <div class="rounded-2xl border-2 border-accent/40 bg-gradient-to-br from-accent/5 via-surface to-accent/10 p-4 sm:p-5 shadow-lg space-y-4">
        <div class="flex items-center justify-between border-b border-line pb-3">
          <div class="flex items-center gap-2">
            <Sparkles class="h-4 w-4 text-accent" />
            <span class="text-xs font-bold uppercase tracking-wider text-fg">
              Recommended Shoe Size (නියමිත ප්‍රමාණය)
            </span>
          </div>
          <span class="text-xs font-semibold text-muted">
            Foot: <b class="font-mono text-fg">{sizingResult.rawLengthCm} cm</b> ({sizingResult.rawLengthInches}")
          </span>
        </div>

        <!-- Hero Size Badges Grid -->
        <div class="grid grid-cols-3 gap-2 sm:gap-3 text-center">
          <!-- Primary UK Size -->
          <div class="rounded-xl border border-accent/50 bg-surface/90 p-3 shadow-md flex flex-col items-center justify-center">
            <span class="text-[10px] font-bold uppercase text-accent">🇬🇧 UK / Sri Lanka</span>
            <span class="font-mono text-3xl sm:text-4xl font-black text-accent mt-0.5">
              UK {sizingResult.ukSize}
            </span>
            <span class="text-[10px] text-muted mt-1">ශ්‍රී ලංකාවේ ප්‍රමාණය</span>
          </div>

          <!-- European EU Size -->
          <div class="rounded-xl border border-line bg-surface/80 p-3 shadow-xs flex flex-col items-center justify-center">
            <span class="text-[10px] font-bold uppercase text-muted">🇪🇺 Europe (EU)</span>
            <span class="font-mono text-2xl sm:text-3xl font-black text-fg mt-0.5">
              {sizingResult.euSize}
            </span>
            <span class="text-[10px] text-dim mt-1">යුරෝපීය ප්‍රමාණය</span>
          </div>

          <!-- US Size -->
          <div class="rounded-xl border border-line bg-surface/80 p-3 shadow-xs flex flex-col items-center justify-center">
            <span class="text-[10px] font-bold uppercase text-muted">🇺🇸 US Size</span>
            <span class="font-mono text-2xl sm:text-3xl font-black text-fg mt-0.5">
              {sizingResult.usSize}
            </span>
            <span class="text-[10px] text-dim mt-1">ඇමරිකානු ප්‍රමාණය</span>
          </div>
        </div>

        <!-- Fitting Advice Notice -->
        <div class="flex items-start gap-2.5 rounded-xl border border-line bg-surface/80 p-3 text-xs">
          <Info class="h-4 w-4 shrink-0 text-accent mt-0.5" />
          <div class="space-y-0.5">
            <div class="font-bold text-fg">
              {sizingResult.fitNotice}
            </div>
            <div class="text-[11px] text-muted">
              {sizingResult.fitNoticeSi} (Toe room allowance: {fit === 'tight' ? '+3mm' : fit === 'wide' ? '+10mm' : '+6mm'}).
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <!-- Button 1: View in-stock shoes in this size -->
          <button
            type="button"
            class="btn btn-primary h-11 text-xs font-bold gap-2 justify-center shadow-md"
            onclick={() => (showStockDrawer = !showStockDrawer)}
          >
            <Store class="h-4 w-4" />
            <span>
              {showStockDrawer ? 'Hide In-Stock Shoes' : `View Shoes in Size UK ${sizingResult.ukSize} (${inStockShoes.length} models)`}
            </span>
          </button>

          <!-- Button 2: WhatsApp Share -->
          <button
            type="button"
            class="btn h-11 text-xs font-bold gap-2 justify-center bg-emerald-600 hover:bg-emerald-700 text-white shadow-md border-0"
            onclick={shareViaWhatsApp}
          >
            <MessageCircle class="h-4 w-4" />
            <span>Send Size Slip to WhatsApp</span>
          </button>
        </div>
      </div>

      <!-- ---------------- IN-STOCK SHOES DRAWER ---------------- -->
      {#if showStockDrawer}
        <div class="rounded-2xl border border-line bg-surface p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div class="flex items-center justify-between border-b border-line pb-2">
            <div class="flex items-center gap-2">
              <ShoppingBag class="h-4 w-4 text-ok" />
              <h3 class="text-xs font-bold text-fg">
                Available at {activeLocName} in Size UK {sizingResult.ukSize} / EU {sizingResult.euSize}
              </h3>
            </div>
            <span class="chip text-[10px] font-bold text-ok">
              {inStockShoes.length} models in stock
            </span>
          </div>

          {#if inStockShoes.length === 0}
            <div class="py-6 text-center text-xs text-muted">
              මෙම ප්‍රමාණයෙන් (UK {sizingResult.ukSize}) මේ මොහොතේ {activeLocName} ශාඛාවේ තොග අවසන් වී ඇත. වෙනත් ශාඛාවක තොග බැලීමට "Check Stock" වෙත යන්න.
            </div>
          {:else}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {#each inStockShoes as { variant, stock }}
                <div class="flex items-center justify-between gap-2 rounded-xl border border-line bg-raised/40 p-2.5 hover:border-fg/30 transition-all">
                  <div class="min-w-0">
                    <div class="truncate text-xs font-bold text-fg">
                      {variant.products?.name || variant.sku}
                    </div>
                    <div class="flex items-center gap-1.5 text-[10px] text-muted">
                      {#if variant.products?.brand}
                        <span class="font-semibold text-fg/80">{variant.products.brand}</span>
                        <span>•</span>
                      {/if}
                      <span>Size: <b>{variant.size}</b></span>
                      {#if variant.colour}
                        <span>• {variant.colour}</span>
                      {/if}
                    </div>
                  </div>

                  <div class="text-right shrink-0">
                    <div class="font-mono text-xs font-black text-fg">
                      {fmtMoney(variant.selling_price)}
                    </div>
                    <span class="inline-flex items-center gap-1 rounded bg-ok/10 px-1.5 py-0.5 text-[10px] font-bold text-ok">
                      {stock} in stock
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Modal Footer -->
    <div class="flex items-center justify-between border-t border-line bg-raised/50 px-4 py-2.5 text-xs shrink-0">
      <div class="flex items-center gap-2">
        <input
          type="text"
          placeholder="Customer name (optional)"
          class="input h-8 text-xs max-w-[200px]"
          bind:value={customerName}
        />
        <button
          type="button"
          class="btn btn-sm text-xs gap-1"
          onclick={copySlipToClipboard}
          title="Copy Size Slip Text"
        >
          <Share2 class="h-3 w-3" />
          <span>Copy</span>
        </button>
      </div>

      <button
        type="button"
        class="btn btn-sm px-4 font-bold text-muted hover:text-fg"
        onclick={() => {
          stopCamera();
          app.sizeFinderOpen = false;
        }}
      >
        Done (අවසන්)
      </button>
    </div>
  </div>
</div>
