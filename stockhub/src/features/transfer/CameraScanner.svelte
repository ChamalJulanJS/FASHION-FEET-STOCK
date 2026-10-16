<script lang="ts">
  import { onMount } from 'svelte';
  import { X, Zap, ZapOff, Focus, ZoomIn, SwitchCamera, CheckCircle2, Camera } from 'lucide-svelte';
  import { app } from '../../lib/app.svelte';

  let { onscan, onclose }: { onscan: (text: string) => void; onclose: () => void } = $props();

  let scanner: any = null;
  let torch = $state(false);
  let ready = $state(false);
  let zoom = $state(1);
  let minZoom = $state(1);
  let maxZoom = $state(4);
  let stepZoom = $state(0.1);
  let hwZoomSupported = $state(false);
  let focusing = $state(false);
  let cameras = $state<{ id: string; label: string }[]>([]);
  let currentCamIdx = $state(-1);
  let lastCode = $state('');
  let lastScanTime = 0;
  let scanCount = $state(0);
  let nativeFileInput: HTMLInputElement | undefined = $state();

  const isIos =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  function getVideoElement(): HTMLVideoElement | null {
    return document.querySelector('#cameraScannerPreview video') as HTMLVideoElement | null;
  }

  function getActiveTrack(): MediaStreamTrack | null {
    const video = getVideoElement();
    const stream = video?.srcObject as MediaStream | null;
    if (!stream) return null;
    const tracks = stream.getVideoTracks();
    return tracks[0] || null;
  }

  function shortLensName(label: string, idx: number): string {
    const l = (label || '').toLowerCase();
    if (l.includes('ultra')) return 'Ultra-Wide (Macro)';
    if (l.includes('tele')) return 'Telephoto (Zoom)';
    if (l.includes('triple') || l.includes('dual')) return 'Auto Multi-Lens';
    if (l.includes('macro')) return 'Macro Lens';
    if (l.includes('back') || l.includes('rear')) return `Main Lens ${idx + 1}`;
    return label || `Lens ${idx + 1}`;
  }

  async function configureTrackFocusAndZoom() {
    const track = getActiveTrack();
    if (!track) return;

    try {
      const caps: any = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};

      // 1. Request higher resolution & continuous autofocus AFTER stream starts (so deviceId isn't overridden on iOS!)
      const adv: any[] = [];
      if (Array.isArray(caps.focusMode)) {
        if (caps.focusMode.includes('continuous')) adv.push({ focusMode: 'continuous' });
        else if (caps.focusMode.includes('single-shot')) adv.push({ focusMode: 'single-shot' });
      }
      if (adv.length > 0) {
        await track.applyConstraints({ advanced: adv }).catch(() => {});
      }

      // 2. Check hardware zoom capabilities
      if (caps.zoom && typeof caps.zoom === 'object') {
        hwZoomSupported = true;
        minZoom = Number(caps.zoom.min) || 1;
        maxZoom = Math.min(Number(caps.zoom.max) || 4, 5);
        stepZoom = Number(caps.zoom.step) || 0.1;
        const initialZoom = isIos ? Math.min(maxZoom, Math.max(minZoom, 2.0)) : Math.min(maxZoom, Math.max(minZoom, 1.5));
        zoom = initialZoom;
        await track.applyConstraints({ advanced: [{ zoom: initialZoom } as any] }).catch(() => {});
      } else {
        hwZoomSupported = false;
        zoom = 1;
      }
    } catch (e) {
      console.warn('Track capabilities setup warning:', e);
    }
  }

  async function applyZoom(newZoom: number) {
    const clamped = Math.min(maxZoom, Math.max(minZoom, Math.round(newZoom * 10) / 10));
    zoom = clamped;
    const track = getActiveTrack();
    if (track && hwZoomSupported) {
      try {
        await track.applyConstraints({ advanced: [{ zoom: clamped } as any] });
        return;
      } catch {}
    }
    const video = getVideoElement();
    if (video) {
      video.style.transform = `scale(${clamped})`;
      video.style.transformOrigin = 'center center';
    }
  }

  async function triggerRefocus() {
    focusing = true;
    const track = getActiveTrack();
    if (track) {
      try {
        const caps: any = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
        if (Array.isArray(caps.focusMode)) {
          if (caps.focusMode.includes('single-shot')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' } as any] }).catch(() => {});
          }
          setTimeout(async () => {
            if (caps.focusMode.includes('continuous')) {
              await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {});
            }
          }, 350);
        }
      } catch {}
    }
    setTimeout(() => {
      focusing = false;
    }, 500);
  }

  function handleDecodedBarcode(decoded: string) {
    const text = decoded?.trim();
    if (!text) return;
    const now = Date.now();
    if (text === lastCode && now - lastScanTime < 1200) return;
    lastCode = text;
    lastScanTime = now;
    scanCount++;

    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([80]);
      } catch {}
    }
    onscan(text);
    app.toast(`Scanned: ${text}`, 'success');
  }

  async function startCamera(cameraId?: string) {
    if (!scanner) return;
    ready = false;
    torch = false;
    if (scanner.isScanning) {
      await scanner.stop().catch(() => {});
    }

    // CRITICAL FIX FOR iOS SAFARI:
    // Pass ONLY cameraId (or facingMode) as the 1st argument and DO NOT pass videoConstraints in the 2nd argument,
    // otherwise html5-qrcode ignores cameraId and locks onto the wrong iPhone lens!
    const cameraTarget = cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' };

    await scanner.start(
      cameraTarget,
      {
        fps: 20,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const w = Math.min(Math.floor(viewfinderWidth * 0.88), 320);
          const h = Math.min(Math.floor(viewfinderHeight * 0.45), 150);
          return { width: Math.max(w, 200), height: Math.max(h, 100) };
        },
        aspectRatio: 1.333334,
      },
      handleDecodedBarcode,
      () => {},
    );

    ready = true;
    setTimeout(() => {
      configureTrackFocusAndZoom();
    }, 300);
  }

  async function selectLensByIndex(idx: number) {
    if (idx < 0 || idx >= cameras.length) return;
    currentCamIdx = idx;
    const target = cameras[idx];
    try {
      await startCamera(target.id);
      app.toast(`Lens: ${shortLensName(target.label, idx)}`, 'info');
    } catch {
      await startCamera();
    }
  }

  async function switchCamera() {
    if (cameras.length < 2) return;
    const nextIdx = (currentCamIdx + 1) % cameras.length;
    await selectLensByIndex(nextIdx);
  }

  async function handleNativePhotoFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !scanner) return;
    try {
      const decoded = await scanner.scanFile(file, false);
      if (decoded) {
        handleDecodedBarcode(decoded);
      }
    } catch {
      app.toast('Could not read barcode from photo — try holding steady with good light.', 'warning');
    } finally {
      input.value = '';
    }
  }

  onMount(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelled) return;

        const formats = Html5QrcodeSupportedFormats
          ? [
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.CODE_39,
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.UPC_A,
              Html5QrcodeSupportedFormats.UPC_E,
              Html5QrcodeSupportedFormats.ITF,
              Html5QrcodeSupportedFormats.QR_CODE,
            ]
          : undefined;

        scanner = new Html5Qrcode('cameraScannerPreview', {
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          formatsToSupport: formats,
          verbose: false,
        });

        try {
          const allDevices = await Html5Qrcode.getCameras();
          if (allDevices && allDevices.length > 0) {
            const backCams = allDevices.filter((d) => /back|rear|environment|ultra|tele|dual|triple/i.test(d.label));
            cameras = backCams.length > 0 ? backCams : allDevices;

            // On iPhone, if "Triple" / "Dual" or "Ultra Wide" is listed, prefer Triple/Dual or Ultra-Wide for close focus!
            if (isIos) {
              const iosBestIdx = cameras.findIndex((c) => /triple|dual|ultra/i.test(c.label));
              currentCamIdx = iosBestIdx !== -1 ? iosBestIdx : 0;
            } else {
              const mainIdx = cameras.findIndex((c) => !/ultra|0\.5|macro/i.test(c.label));
              currentCamIdx = mainIdx !== -1 ? mainIdx : 0;
            }
          }
        } catch {}

        if (cancelled) return;
        if (cameras.length > 0 && currentCamIdx >= 0) {
          try {
            await startCamera(cameras[currentCamIdx].id);
          } catch {
            await startCamera();
          }
        } else {
          await startCamera();
        }
      } catch (err: any) {
        console.error('Camera start failed:', err);
        app.toast('Camera access error: ' + (err?.message || 'Permission denied'), 'error');
        onclose();
      }
    })();

    return () => {
      cancelled = true;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  });

  async function toggleTorch() {
    const track = getActiveTrack();
    if (track) {
      try {
        torch = !torch;
        await track.applyConstraints({ advanced: [{ torch } as any] });
        return;
      } catch {}
    }
    if (scanner?.isScanning) {
      try {
        torch = !torch;
        await scanner.applyVideoConstraints({ advanced: [{ torch }] });
      } catch {
        torch = false;
        app.toast('Torch is not supported on this camera lens', 'info');
      }
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<input
  bind:this={nativeFileInput}
  type="file"
  accept="image/*"
  capture="environment"
  class="hidden"
  onchange={handleNativePhotoFile}
/>

<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation">
  <div class="card w-full max-w-md overflow-hidden rounded-t-2xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label="Camera barcode scanner">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-line px-4 py-3">
      <div>
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold text-fg">HD Barcode Scanner</h3>
          {#if scanCount > 0}
            <span class="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 font-mono text-[11px] font-bold text-ok">
              <CheckCircle2 class="h-3 w-3" /> {scanCount} scanned
            </span>
          {/if}
        </div>
        <p class="text-[11px] text-muted">
          {#if isIos}
            On iPhone: Select <b>Ultra-Wide (Macro)</b> lens below for close focus, or hold ~20cm back.
          {:else}
            Hold ~15cm away and use <b>1.5x / 2x Zoom</b> for sharp focus on small barcodes.
          {/if}
        </p>
      </div>
      <button class="btn btn-ghost btn-sm" onclick={onclose} aria-label="Close scanner">
        <X class="size-4" />
      </button>
    </div>

    <!-- Camera Lens Pills (Direct 1-Tap Lens Selection for iPhone & Multi-Camera Phones) -->
    {#if cameras.length > 1}
      <div class="flex flex-wrap items-center gap-1.5 border-b border-line bg-raised/70 px-3 py-2">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-dim">Lens:</span>
        {#each cameras as cam, idx}
          <button
            type="button"
            class="cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition
              {currentCamIdx === idx ? 'bg-fg text-bg font-semibold shadow-xs' : 'border border-line bg-surface text-muted hover:text-fg'}"
            onclick={() => selectLensByIndex(idx)}
          >
            {shortLensName(cam.label, idx)}
          </button>
        {/each}
      </div>
    {/if}

    <!-- Camera Viewfinder -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="relative overflow-hidden bg-black cursor-pointer"
      onclick={triggerRefocus}
      title="Tap screen to refocus camera"
    >
      <div id="cameraScannerPreview" class="mx-auto w-full overflow-hidden"></div>

      {#if !ready}
        <p class="p-8 text-center text-sm text-muted">Starting camera lens...</p>
      {/if}

      {#if focusing}
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div class="h-20 w-20 animate-ping rounded-xl border-2 border-white/80"></div>
        </div>
      {/if}

      {#if lastCode}
        <div class="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-3 py-1 font-mono text-xs font-semibold text-white shadow-lg">
          Last: {lastCode}
        </div>
      {/if}
    </div>

    <!-- Zoom Controls -->
    <div class="border-t border-line bg-raised/50 px-4 py-2.5">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 text-xs font-medium text-muted">
          <ZoomIn class="h-3.5 w-3.5 text-fg" />
          <span>Zoom ({zoom.toFixed(1)}x)</span>
        </div>
        <div class="flex items-center gap-1">
          {#each [1, 1.5, 2, 2.5, 3] as preset}
            {#if preset <= maxZoom}
              <button
                type="button"
                class="cursor-pointer rounded px-2 py-0.5 font-mono text-[11px] font-semibold transition
                  {Math.abs(zoom - preset) < 0.15 ? 'bg-fg text-bg' : 'border border-line bg-surface text-muted hover:text-fg'}"
                onclick={() => applyZoom(preset)}
              >
                {preset}x
              </button>
            {/if}
          {/each}
        </div>
      </div>
      <input
        type="range"
        min={minZoom}
        max={maxZoom}
        step={stepZoom}
        value={zoom}
        oninput={(e) => applyZoom(parseFloat((e.currentTarget as HTMLInputElement).value))}
        class="mt-2 h-1.5 w-full cursor-pointer accent-fg"
        aria-label="Camera zoom"
      />
    </div>

    <!-- Action Buttons -->
    <div class="grid grid-cols-4 gap-1.5 border-t border-line p-3">
      <button type="button" class="btn btn-sm px-2 text-[11px]" onclick={triggerRefocus} title="Tap to re-focus camera">
        <Focus class="size-3.5" />
        <span>Focus</span>
      </button>

      <button
        type="button"
        class="btn btn-sm px-2 text-[11px]"
        onclick={() => nativeFileInput?.click()}
        title="Open native iPhone Camera with full hardware Macro Focus"
      >
        <Camera class="size-3.5" />
        <span>iOS Snap</span>
      </button>

      <button type="button" class="btn btn-sm px-2 text-[11px]" onclick={toggleTorch} aria-pressed={torch}>
        {#if torch}<Zap class="size-3.5 text-warn" /> Torch{:else}<ZapOff class="size-3.5" /> Torch{/if}
      </button>

      <button type="button" class="btn btn-primary btn-sm px-2 text-[11px]" onclick={onclose}>
        Done
      </button>
    </div>
  </div>
</div>
