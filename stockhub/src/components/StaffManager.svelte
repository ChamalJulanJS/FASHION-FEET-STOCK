<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { X, KeyRound, UserPlus } from 'lucide-svelte';

  function resetFor(email: string) {
    app.staffManagerOpen = false;
    app.authTab = 'reset';
    app.authPrefillEmail = email;
    app.authMandatory = false;
    app.authOpen = true;
  }
  function addNew() {
    app.staffManagerOpen = false;
    app.authTab = 'signup';
    app.authMandatory = false;
    app.authOpen = true;
  }
</script>

{#if app.staffManagerOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onclick={() => (app.staffManagerOpen = false)}>
    <div class="card flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-b-none shadow-2xl sm:rounded-b-xl" role="dialog" aria-modal="true" aria-label="Staff directory" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="flex items-start justify-between gap-3 border-b border-line p-4 sm:p-5">
        <div class="min-w-0">
          <div class="font-display text-base font-semibold text-fg sm:text-lg">Store staff accounts</div>
          <p class="text-xs text-muted">Manage logins, assigned branches and reset staff passwords.</p>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button class="btn btn-primary btn-sm" onclick={addNew}><UserPlus class="h-3.5 w-3.5" /><span>Add staff</span></button>
          <button class="btn btn-ghost btn-sm" onclick={() => (app.staffManagerOpen = false)} aria-label="Close"><X class="h-4 w-4" /></button>
        </div>
      </div>

      <div class="overflow-y-auto">
        <!-- Mobile Card List (< sm) -->
        <ul class="divide-y divide-line sm:hidden">
          {#each app.allStaff as s}
            <li class="flex items-center justify-between gap-3 px-4 py-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="truncate text-xs font-semibold text-fg">{s.name || s.email.split('@')[0]}</span>
                  <span class="chip py-0 text-[10px] uppercase">{s.role || 'staff'}</span>
                </div>
                <div class="mt-0.5 truncate font-mono text-[11px] text-muted">{s.email}</div>
                <div class="mt-0.5 text-[11px] text-dim">{app.locationName(s.location_id) || 'All branches'}</div>
              </div>
              <button class="btn btn-sm shrink-0" onclick={() => resetFor(s.email)}>
                <KeyRound class="h-3.5 w-3.5 text-muted" />
                <span>Reset PIN</span>
              </button>
            </li>
          {:else}
            <li class="p-6 text-center text-xs text-dim">No staff profiles found.</li>
          {/each}
        </ul>

        <!-- Desktop Table (>= sm) -->
        <div class="hidden overflow-x-auto sm:block">
          <table class="w-full">
            <thead class="border-b border-line bg-raised/40">
              <tr><th class="th">Name</th><th class="th">Email</th><th class="th">Role</th><th class="th">Branch</th><th class="th text-right">Action</th></tr>
            </thead>
            <tbody class="divide-y divide-line">
              {#each app.allStaff as s}
                <tr class="hover:bg-raised/30">
                  <td class="td font-medium text-fg">{s.name || s.email.split('@')[0]}</td>
                  <td class="td font-mono text-xs text-muted">{s.email}</td>
                  <td class="td"><span class="chip uppercase">{s.role || 'staff'}</span></td>
                  <td class="td text-xs text-muted">{app.locationName(s.location_id) || 'All branches'}</td>
                  <td class="td text-right"><button class="btn btn-sm" onclick={() => resetFor(s.email)}><KeyRound class="h-3.5 w-3.5" />Reset password</button></td>
                </tr>
              {:else}
                <tr><td class="td text-center text-dim" colspan="5">No staff profiles found.</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
{/if}
