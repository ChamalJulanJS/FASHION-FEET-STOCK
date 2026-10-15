<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { login, signUp, resetPassword } from '../lib/auth';
  import { Boxes, X, Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, User } from 'lucide-svelte';

  let email = $state('');
  let password = $state('');
  let remember = $state(true);
  let showPw = $state(false);
  let busy = $state(false);

  let suName = $state('');
  let suEmail = $state('');
  let suPw = $state('');
  let suRole = $state('branch_manager');
  let suBranch = $state('');

  let rsEmail = $state('');
  let rsPw = $state('');
  let rsPw2 = $state('');

  // Prefill e-mail after sign-up / reset
  $effect(() => {
    if (app.authPrefillEmail) {
      email = app.authPrefillEmail;
      rsEmail = app.authPrefillEmail;
      app.authPrefillEmail = '';
    }
  });
  $effect(() => {
    if (!suBranch && app.locations.length) suBranch = app.locations[0].id;
  });

  async function onLogin(e: Event) {
    e.preventDefault();
    busy = true;
    const ok = await login(email, password, remember);
    busy = false;
    if (ok) password = '';
  }
  async function onSignUp(e: Event) {
    e.preventDefault();
    busy = true;
    await signUp(suName, suEmail, suPw, suRole, suBranch);
    busy = false;
  }
  async function onReset(e: Event) {
    e.preventDefault();
    if (rsPw !== rsPw2) return app.toast('Passwords do not match.', 'error');
    busy = true;
    await resetPassword(rsEmail, rsPw);
    busy = false;
  }

  const tabs = [
    { id: 'login', label: 'Sign In' },
    { id: 'signup', label: 'New Staff' },
    { id: 'reset', label: 'Reset PIN' },
  ] as const;
</script>

{#if app.authOpen}
  <div class="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
    <div class="card relative w-full max-w-md p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label="Staff sign in">
      {#if !app.authMandatory}
        <button class="btn btn-ghost btn-sm absolute right-3 top-3" onclick={() => (app.authOpen = false)} aria-label="Close"><X class="h-4 w-4" /></button>
      {/if}

      <div class="mb-5 flex items-center gap-3">
        <div class="grid h-10 w-10 place-items-center rounded-xl bg-accent text-white"><Boxes class="h-5 w-5" /></div>
        <div>
          <div class="font-display text-lg font-semibold">FashionFeet Stock Hub</div>
          <div class="text-xs text-dim">Branch stock transfer &amp; dispatch</div>
        </div>
      </div>

      <div class="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-raised p-1">
        {#each tabs as t}
          <button
            class="cursor-pointer rounded-lg py-1.5 text-sm font-medium transition {app.authTab === t.id ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg'}"
            onclick={() => (app.authTab = t.id)}>{t.label}</button
          >
        {/each}
      </div>

      {#if app.authTab === 'login'}
        {#if app.allStaff.length}
          <div class="mb-4 flex flex-wrap gap-1.5">
            {#each app.allStaff as s}
              <button
                type="button"
                class="chip cursor-pointer gap-1.5 transition hover:border-accent/60 {email.toLowerCase() === s.email.toLowerCase() ? 'border-accent text-accent' : ''}"
                onclick={() => { email = s.email; password = ''; }}
                title="{s.email} ({s.role ?? 'staff'})"
              >
                <User class="h-3 w-3" />{s.name || s.email.split('@')[0]}
              </button>
            {/each}
          </div>
        {/if}
        <form class="space-y-4" onsubmit={onLogin}>
          <div>
            <label class="label" for="lg-email">Staff email</label>
            <div class="relative"><Mail class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
              <input id="lg-email" class="input pl-9" type="email" required autocomplete="username" placeholder="transfer.admin@ff.pos" bind:value={email} /></div>
          </div>
          <div>
            <label class="label" for="lg-pw">Password / PIN</label>
            <div class="relative"><Lock class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
              <input id="lg-pw" class="input px-9" type={showPw ? 'text' : 'password'} required autocomplete="current-password" placeholder="••••••••" bind:value={password} />
              <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1 text-dim hover:text-fg" onclick={() => (showPw = !showPw)} aria-label="Toggle password visibility">
                {#if showPw}<EyeOff class="h-4 w-4" />{:else}<Eye class="h-4 w-4" />{/if}
              </button></div>
          </div>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" class="accent-[var(--accent)]" bind:checked={remember} />Keep me signed in on this device
          </label>
          <button class="btn btn-primary w-full" disabled={busy}>Sign in <ArrowRight class="h-4 w-4" /></button>
          <p class="flex items-center justify-center gap-1.5 text-xs text-dim"><ShieldCheck class="h-3.5 w-3.5" />Cloud encrypted</p>
        </form>
      {:else if app.authTab === 'signup'}
        <form class="space-y-4" onsubmit={onSignUp}>
          <div><label class="label" for="su-name">Full name</label><input id="su-name" class="input" required placeholder="e.g. Kasun Perera" bind:value={suName} /></div>
          <div><label class="label" for="su-email">Email (login ID)</label><input id="su-email" class="input" type="email" required placeholder="e.g. transfer.kasun@ff.pos" bind:value={suEmail} /></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="label" for="su-role">Role</label>
              <select id="su-role" class="input" bind:value={suRole}>
                <option value="branch_manager">Branch Transfer Staff / Manager</option>
                <option value="warehouse_manager">Warehouse / Head Office Dispatcher</option>
                <option value="admin">Administrator / Owner</option>
                <option value="cashier">Store Staff</option>
              </select></div>
            <div><label class="label" for="su-branch">Assigned branch</label>
              <select id="su-branch" class="input" bind:value={suBranch}>
                {#each app.locations as l}<option value={l.id}>{l.name}</option>{/each}
              </select></div>
          </div>
          <div><label class="label" for="su-pw">Password / PIN</label><input id="su-pw" class="input" type="password" required minlength="6" placeholder="Min 6 characters" autocomplete="new-password" bind:value={suPw} /></div>
          <button class="btn btn-primary w-full" disabled={busy}>Create staff account <ArrowRight class="h-4 w-4" /></button>
        </form>
      {:else}
        <form class="space-y-4" onsubmit={onReset}>
          <div><label class="label" for="rs-email">Staff email</label><input id="rs-email" class="input" type="email" required bind:value={rsEmail} /></div>
          <div><label class="label" for="rs-pw">New password / PIN</label><input id="rs-pw" class="input" type="password" required minlength="6" autocomplete="new-password" bind:value={rsPw} /></div>
          <div><label class="label" for="rs-pw2">Confirm new password</label><input id="rs-pw2" class="input" type="password" required minlength="6" autocomplete="new-password" bind:value={rsPw2} /></div>
          <button class="btn btn-primary w-full" disabled={busy}>Reset &amp; update password <ArrowRight class="h-4 w-4" /></button>
        </form>
      {/if}
    </div>
  </div>
{/if}
