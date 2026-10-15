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
  <div class="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onclick={() => (app.staffManagerOpen = false)}>
    <div class="card w-full max-w-3xl shadow-2xl" role="dialog" aria-modal="true" aria-label="Staff directory" onclick={(e) => e.stopPropagation()}>
      <div class="flex items-start justify-between gap-3 border-b border-line p-5">
        <div>
          <div class="font-display text-lg font-semibold">Store staff accounts</div>
          <p class="text-sm text-muted">Manage logins, assigned branches and reset staff passwords.</p>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn btn-primary btn-sm" onclick={addNew}><UserPlus class="h-3.5 w-3.5" />Add staff</button>
          <button class="btn btn-ghost btn-sm" onclick={() => (app.staffManagerOpen = false)} aria-label="Close"><X class="h-4 w-4" /></button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-line"><tr><th class="th">Name</th><th class="th">Email</th><th class="th">Role</th><th class="th">Branch</th><th class="th"></th></tr></thead>
          <tbody class="divide-y divide-line">
            {#each app.allStaff as s}
              <tr>
                <td class="td font-medium">{s.name || s.email.split('@')[0]}</td>
                <td class="td font-mono text-xs text-muted">{s.email}</td>
                <td class="td"><span class="chip uppercase">{s.role || 'staff'}</span></td>
                <td class="td text-muted">{app.locationName(s.location_id) || 'All branches'}</td>
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
{/if}
