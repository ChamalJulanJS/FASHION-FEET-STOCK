<script lang="ts">
  import { X, Check, Globe, Send, Copy, AlertCircle, Sparkles, CheckCircle2, Loader2, ExternalLink } from 'lucide-svelte';
  import { app } from '../../lib/app.svelte';
  import {
    loadN8nWebhookUrl,
    saveN8nWebhookUrl,
    loadN8nAutoSend,
    saveN8nAutoSend,
    testN8nWebhook,
  } from './logic';

  let { onclose }: { onclose: () => void } = $props();

  let webhookUrl = $state('');
  let autoSend = $state(true);
  let testing = $state(false);
  let testResult = $state<{ ok: boolean; message: string } | null>(null);
  let copiedJson = $state(false);

  $effect(() => {
    webhookUrl = loadN8nWebhookUrl();
    autoSend = loadN8nAutoSend();
  });

  async function handleTest() {
    if (!webhookUrl.trim()) {
      testResult = { ok: false, message: 'Please enter your VPS n8n Webhook URL first.' };
      return;
    }
    testing = true;
    testResult = null;
    try {
      const res = await testN8nWebhook(webhookUrl.trim());
      testResult = res;
      if (res.ok) {
        app.toast('✓ VPS n8n Webhook Connected Successfully!', 'success');
      } else {
        app.toast('⚠ Could not connect to VPS Webhook', 'warning');
      }
    } finally {
      testing = false;
    }
  }

  function handleSave() {
    saveN8nWebhookUrl(webhookUrl.trim());
    saveN8nAutoSend(autoSend);
    app.toast('✓ n8n WhatsApp settings saved!', 'success');
    onclose();
  }

  async function copyWorkflowJson() {
    try {
      // Basic n8n workflow JSON ready to import
      const wf = {
        name: "FashionFeet — Mobile POS WhatsApp Digital Bill",
        nodes: [
          {
            parameters: {
              httpMethod: "POST",
              path: "fashionfeet-pos-bill",
              responseMode: "responseNode"
            },
            name: "POS Bill Webhook",
            type: "n8n-nodes-base.webhook",
            typeVersion: 2,
            position: [220, 300]
          },
          {
            parameters: {
              jsCode: "const body = $input.first().json.body || $input.first().json;\nreturn [{\n  json: {\n    customer_phone: String(body.customer_phone || '').replace(/\\D/g, ''),\n    invoice_no: body.display_invoice || body.invoice_no,\n    branch_name: body.branch_name,\n    total_amount: body.total,\n    message_text: body.whatsapp_message,\n    receipt_url: body.receipt_url\n  }\n}];"
            },
            name: "Format Receipt",
            type: "n8n-nodes-base.code",
            typeVersion: 2,
            position: [460, 300]
          },
          {
            parameters: {
              respondWith: "json",
              responseBody: "={\n  \"success\": true,\n  \"invoice\": $json.invoice_no\n}"
            },
            name: "Respond to POS (200)",
            type: "n8n-nodes-base.respondToWebhook",
            typeVersion: 1.1,
            position: [700, 200]
          }
        ],
        connections: {
          "POS Bill Webhook": {
            main: [[{ node: "Format Receipt", type: "main", index: 0 }]]
          },
          "Format Receipt": {
            main: [[{ node: "Respond to POS (200)", type: "main", index: 0 }]]
          }
        }
      };

      await navigator.clipboard.writeText(JSON.stringify(wf, null, 2));
      copiedJson = true;
      app.toast('n8n Workflow JSON copied! Paste into your VPS n8n canvas (Ctrl+V).', 'success');
      setTimeout(() => (copiedJson = false), 3500);
    } catch {
      app.toast('Could not copy JSON to clipboard.', 'error');
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div
  class="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
  role="presentation"
>
  <div
    class="card flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-b-none sm:rounded-b-2xl shadow-2xl"
    role="dialog"
    aria-modal="true"
    aria-label="n8n WhatsApp Webhook Settings"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-line bg-raised/70 p-4">
      <div class="flex items-center gap-2.5">
        <div class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ok/15 text-ok border border-ok/30">
          <Globe class="h-5 w-5" />
        </div>
        <div>
          <h3 class="font-display text-base font-bold text-fg">
            VPS n8n WhatsApp Webhook Settings
          </h3>
          <p class="text-xs text-muted">
            Connect Mobile POS directly to your 24/7 VPS n8n instance
          </p>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm size-8 p-0" onclick={onclose} aria-label="Close">
        <X class="size-4" />
      </button>
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
      <!-- Sinhala Guidance Note for Power Outage -->
      <div class="rounded-xl border border-ok/30 bg-ok/5 p-3.5 space-y-1.5">
        <div class="font-bold text-fg flex items-center gap-1.5">
          <Sparkles class="h-4 w-4 text-ok shrink-0" />
          <span>විදුලිය විසන්ධි වූ විට (Power Cut) Mobile එකෙන් බිල් ගැසීම:</span>
        </div>
        <p class="text-muted leading-relaxed">
          කවුන්ටර් පරිගණකය ක්‍රියාවිරහිත වුවද, ඔබේ <strong>VPS එකේ n8n නිරන්තරයෙන්ම (24/7) ක්‍රියාත්මක බැවින්</strong>, Mobile POS එකෙන් බිල ගසන සැනින් කස්ටමර්ගේ WhatsApp එකට ඩිජිටල් බිල සහ ඊ-ලින්ක් එක ස්වයංක්‍රීයවම යැවිය හැක!
        </p>
      </div>

      <!-- Webhook URL Input -->
      <div class="space-y-1.5">
        <label for="n8n-webhook-url" class="font-bold text-fg flex items-center justify-between">
          <span>n8n Webhook Production URL *</span>
          {#if webhookUrl.trim()}
            <span class="text-[10px] text-ok font-mono font-normal">● URL Configured</span>
          {/if}
        </label>
        <div class="relative">
          <Globe class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
          <input
            id="n8n-webhook-url"
            type="url"
            class="input h-10 pl-8 pr-20 text-xs font-mono"
            placeholder="https://n8n.your-vps.com/webhook/fashionfeet-pos-bill"
            bind:value={webhookUrl}
          />
          <button
            type="button"
            class="btn btn-sm absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-2.5 text-[11px] font-bold"
            onclick={handleTest}
            disabled={testing || !webhookUrl.trim()}
          >
            {#if testing}
              <Loader2 class="h-3 w-3 animate-spin" />
              <span>Testing...</span>
            {:else}
              <Send class="h-3 w-3" />
              <span>Ping Test</span>
            {/if}
          </button>
        </div>
        <p class="text-[11px] text-dim">
          ඔබේ VPS එකේ n8n Webhook node එකේ <strong>Production URL</strong> එක මෙහි paste කරන්න.
        </p>
      </div>

      <!-- Test Result Box -->
      {#if testResult}
        <div
          class="rounded-xl border p-3 flex items-start gap-2.5 {testResult.ok ? 'border-ok/30 bg-ok/10 text-ok' : 'border-warn/30 bg-warn/10 text-warn'}"
        >
          {#if testResult.ok}
            <CheckCircle2 class="h-4 w-4 shrink-0 mt-0.5 text-ok" />
          {:else}
            <AlertCircle class="h-4 w-4 shrink-0 mt-0.5 text-warn" />
          {/if}
          <div class="text-xs">
            <div class="font-bold">{testResult.ok ? 'Connection Successful!' : 'Connection Warning'}</div>
            <div class="mt-0.5 leading-relaxed text-fg/90">{testResult.message}</div>
          </div>
        </div>
      {/if}

      <!-- Auto Send Toggle -->
      <label class="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 select-none">
        <div class="space-y-0.5">
          <div class="font-bold text-fg">Auto-Send WhatsApp Bill on Sale (ස්වයංක්‍රීයව යවන්න)</div>
          <div class="text-[11px] text-muted">
            බිල complete වූ වහාම n8n හරහා WhatsApp පණිවිඩය නිකුත් කෙරේ.
          </div>
        </div>
        <input
          type="checkbox"
          class="h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
          bind:checked={autoSend}
        />
      </label>

      <!-- n8n Workflow JSON Blueprint Copy Box -->
      <div class="rounded-xl border border-line bg-raised/50 p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-bold text-fg">n8n Workflow Blueprint (VPS එකට Add කරගන්න)</span>
          <button
            type="button"
            class="btn btn-sm h-7 px-2.5 text-[11px] font-bold"
            onclick={copyWorkflowJson}
          >
            {#if copiedJson}
              <Check class="h-3 w-3 text-ok" />
              <span class="text-ok">Copied!</span>
            {:else}
              <Copy class="h-3 w-3" />
              <span>Copy n8n JSON</span>
            {/if}
          </button>
        </div>
        <p class="text-[11px] text-muted leading-relaxed">
          මෙම JSON එක Copy කර n8n Editor Canvas එකට ගොස් <strong>Ctrl + V</strong> කරන්න. එවිට Webhook &amp; Formatter Nodes ස්වයංක්‍රීයව නිර්මාණය වේ!
        </p>
      </div>
    </div>

    <!-- Footer Actions -->
    <div class="flex gap-2 border-t border-line bg-surface p-3.5">
      <button type="button" class="btn btn-sm flex-1" onclick={onclose}>
        <span>Cancel</span>
      </button>
      <button type="button" class="btn btn-primary btn-sm flex-1 font-bold" onclick={handleSave}>
        <span>Save Settings (සේව් කරන්න)</span>
      </button>
    </div>
  </div>
</div>