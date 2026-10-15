<script lang="ts">
  import { onMount } from 'svelte';
  import { X, Zap, ZapOff } from 'lucide-svelte';
  import { app } from '../../lib/app.svelte';

  let { onscan, onclose }: { onscan: (text: string) => void; onclose: () => void } = $props();

  let scanner: any = null;
  let torch = $state(false);
  let ready = $state(false);

  onMount(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        scanner = new Html5Qrcode('cameraScannerPreview');
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 250, height: 180 }, aspectRatio: 1.0 },
          (decoded: string) => {
            const text = decoded?.trim();
            if (!text) return;
            if ('vibrate' in navigator) {
              try {
                navigator.vibrate([100]);
              } catch {}
            }
            onscan(text);
            app.toast(`Scanned: ${text}`, 'success');
          },
          () => {},
        );
        ready = true;
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
    if (scanner?.isScanning) {
      try {
        torch = !torch;
        await scanner.applyVideoConstraints({ advanced: [{ torch }] });
      } catch {
        torch = false;
        app.toast('Torch is not supported by your camera', 'info');
      }
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation">
  <div class="card w-full max-w-md overflow-hidden" role="dialog" aria-modal="true" aria-label="Camera barcode scanner">
    <div class="flex items-center justify-between border-b border-line px-4 py-3">
      <div>
        <h3 class="text-sm font-semibold text-fg">Scan barcode</h3>
        <p class="text-xs text-muted">Point the camera at a shoe box barcode.</p>
      </div>
      <button class="btn btn-ghost btn-sm" onclick={onclose} aria-label="Close scanner"><X class="size-4" /></button>
    </div>
    <div class="bg-black">
      <div id="cameraScannerPreview" class="mx-auto w-full"></div>
      {#if !ready}<p class="p-6 text-center text-sm text-muted">Starting camera...</p>{/if}
    </div>
    <div class="flex gap-2 p-4">
      <button class="btn flex-1" onclick={toggleTorch} aria-pressed={torch}>
        {#if torch}<Zap class="size-4 text-accent" /> Torch on{:else}<ZapOff class="size-4" /> Torch{/if}
      </button>
      <button class="btn btn-primary flex-1" onclick={onclose}>Done</button>
    </div>
  </div>
</div>
