<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-svelte';
  const icons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
  const tone = { success: 'text-ok', error: 'text-bad', warning: 'text-warn', info: 'text-accent' };
</script>

<div class="pointer-events-none fixed left-3 right-3 top-16 z-[100] flex flex-col gap-2 sm:left-auto sm:right-5 sm:w-[360px]" aria-live="polite">
  {#each app.toasts as t (t.id)}
    {@const Icon = icons[t.kind]}
    <div class="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line bg-surface/95 px-3.5 py-2.5 text-xs shadow-xl shadow-black/30 backdrop-blur">
      <Icon class="mt-0.5 h-4 w-4 shrink-0 {tone[t.kind]}" />
      <span class="text-fg leading-relaxed">{t.message}</span>
    </div>
  {/each}
</div>
