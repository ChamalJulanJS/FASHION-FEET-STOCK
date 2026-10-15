<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-svelte';
  const icons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
  const tone = { success: 'text-ok', error: 'text-bad', warning: 'text-warn', info: 'text-accent' };
</script>

<div class="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2" aria-live="polite">
  {#each app.toasts as t (t.id)}
    {@const Icon = icons[t.kind]}
    <div class="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-xl shadow-black/30">
      <Icon class="mt-0.5 h-4 w-4 shrink-0 {tone[t.kind]}" />
      <span class="text-fg">{t.message}</span>
    </div>
  {/each}
</div>
