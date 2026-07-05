import { For, Show } from "solid-js";

import type { AgentReceipt, AgentReceiptItem } from "~/lib/momo/agent_receipt";

function AgentReceiptCard(props: { readonly receipt: AgentReceipt }) {
  return (
    <article class="rounded-xs border border-border bg-bg-primary p-3" data-momo-surface="receipt">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium text-text-primary">{props.receipt.title}</p>
          <p class="mt-1 text-xs wrap-break-word text-text-muted">{props.receipt.summary}</p>
        </div>
        <span class="mt-1 size-1.5 shrink-0 rounded-full bg-success" />
      </div>

      <Show when={props.receipt.providerNote}>
        {(note) => (
          <p class="mt-3 rounded-xs border border-warning-border bg-warning-bg px-2 py-1.5 text-[0.75rem] text-warning">
            {note()}
          </p>
        )}
      </Show>

      <div class="mt-3 space-y-3">
        <For each={props.receipt.sections}>
          {(section) => (
            <section class="rounded-xs border border-border bg-bg-secondary/70">
              <div class="border-b border-border px-2.5 py-2">
                <p class="text-[0.6875rem] font-semibold text-text-muted uppercase">
                  {section.title}
                </p>
              </div>
              <ul class="divide-y divide-border">
                <For each={section.items}>
                  {(item) => (
                    <li class="px-2.5 py-2">
                      <p class="text-[0.8125rem] font-medium wrap-break-word text-text-primary">
                        {item.title}
                      </p>
                      <p class="mt-1 text-[0.75rem] text-text-muted">{item.detail}</p>
                      <ReceiptItemDetails item={item} />
                    </li>
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>
      </div>
    </article>
  );
}

function ReceiptItemDetails(props: { readonly item: AgentReceiptItem }) {
  return (
    <Show when={props.item.path}>
      {(path) => (
        <details class="mt-2 text-[0.6875rem] text-text-muted">
          <summary class="cursor-pointer text-text-secondary">File details</summary>
          <p class="mt-1 rounded-xs border border-border bg-bg-primary px-2 py-1 wrap-break-word">
            {path()}
          </p>
        </details>
      )}
    </Show>
  );
}

export { AgentReceiptCard };
