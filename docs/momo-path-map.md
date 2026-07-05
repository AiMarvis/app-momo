# Momo Path Map

Pinned upstream: `ea07b629ead912ada70442e8c87ae90359742d33` (`kuku-mom/kuku`).

## Desktop Shell And Layout

- App entry: `apps/desktop/src/index.tsx`
- Main shell: `apps/desktop/src/app.tsx`
- Layout frame: `apps/desktop/src/components/layout/panel_layout.tsx`
- Left vault panel: `apps/desktop/src/components/layout/left_panel.tsx`, `apps/desktop/src/components/vault/vault_browser.tsx`
- Center panel/editor host: `apps/desktop/src/components/layout/center_panel.tsx`, `apps/desktop/src/components/editor/markdown_editor.tsx`
- Right panel and tabs: `apps/desktop/src/components/layout/right_panel.tsx`, `apps/desktop/src/components/layout/right_panel_tab_bar.tsx`
- Plugin boot/slots: `apps/desktop/src/plugins/bootstrap.ts`, `apps/desktop/src/plugins/slots.tsx`
- App styles: `apps/desktop/src/index.css`

## Vault Commands And FS Wrappers

- Frontend vault wrapper: `apps/desktop/src/lib/vault_fs.ts`
- Frontend vault state/mutations: `apps/desktop/src/stores/vault.ts`
- Tauri vault commands: `apps/desktop/src-tauri/src/vault/commands.rs`
- Tauri vault module: `apps/desktop/src-tauri/src/vault/mod.rs`
- Path checks/types: `apps/desktop/src/lib/vault_path.ts`, `apps/desktop/src/lib/vault_types.ts`, `apps/desktop/src-tauri/src/models.rs`
- Watcher: `apps/desktop/src-tauri/src/vault/watcher.rs`

## Mutation Path

- Checksum writes from UI: `apps/desktop/src/lib/vault_fs.ts` -> `apps/desktop/src/stores/vault.ts`
- Tauri guarded write/delete/rename/mkdir: `apps/desktop/src-tauri/src/vault/commands.rs`
- Mutation-to-sync bridge: `apps/desktop/src-tauri/src/vault/mutation_sync.rs`
- Knowledge apply flow: `apps/desktop/src-tauri/src/knowledge/apply.rs`, `apps/desktop/src/plugins/builtin/knowledge/editor_apply.ts`
- AI mutation/session layer: `crates/kuku-ai/src/mutation.rs`, `crates/kuku-ai/src/session.rs`, `crates/kuku-ai/src/state.rs`

## AI Chat And Provider Surfaces

- AI chat plugin registration: `apps/desktop/src/plugins/builtin/ai_chat/index.ts`
- Chat UI/state: `apps/desktop/src/plugins/builtin/ai_chat/chat_panel.tsx`, `apps/desktop/src/plugins/builtin/ai_chat/chat_store.ts`
- Chat settings/config: `apps/desktop/src/plugins/builtin/ai_chat/components/ai_settings.tsx`, `apps/desktop/src/plugins/builtin/ai_chat/config.ts`
- Tool bridge and approvals: `apps/desktop/src/plugins/builtin/ai_chat/proxy_tool_bridge.ts`, `apps/desktop/src/plugins/builtin/ai_chat/approval_diff.ts`, `apps/desktop/src/plugins/builtin/ai_chat/components/approval_widget.tsx`
- Tauri AI host/tools: `apps/desktop/src-tauri/src/ai_host/`, `apps/desktop/src-tauri/src/ai_tools/`
- Rust AI crate: `crates/kuku-ai/src/commands.rs`, `crates/kuku-ai/src/host.rs`, `crates/kuku-ai/src/contract.rs`, `crates/kuku-ai/src/prompts.rs`

## Secure Storage And Keychain

- Secure storage wrapper: `apps/desktop/src-tauri/src/secure_storage.rs`
- Plugin secret commands: `apps/desktop/src-tauri/src/plugin_secrets.rs`
- Sync key storage: `apps/desktop/src-tauri/src/sync/keys.rs`, `apps/desktop/src-tauri/src/sync/account_keys.rs`
- App variant paths: `apps/desktop/src-tauri/src/variant.rs`

## Indexer, Search, Graph

- Core indexer plugin: `apps/desktop/src/plugins/builtin/core_indexer/`
- Search plugin/runtime: `apps/desktop/src/plugins/builtin/search/`
- Graph plugin: `apps/desktop/src/plugins/builtin/graph_view/`
- Voxel graph plugin: `apps/desktop/src/plugins/builtin/voxel_graph/`
- Tauri search/index commands: `apps/desktop/src-tauri/src/search/`
- Rust indexer crate: `crates/kuku-indexer/src/`
- Wikilink resolver: `crates/kuku-indexer/src/wikilink.rs`, `apps/desktop/src-tauri/src/search/wikilink.rs`

## Contracts

- Proto source/config: `packages/contract/proto/`, `packages/contract/buf.yaml`, `packages/contract/buf.gen.yaml`
- Generated TS contracts: `packages/contract/gen/es/`
- Generated Go contracts: `packages/contract/gen/go/`
- Rust contract crate: `crates/kuku-contract/src/lib.rs`
- Desktop contract client: `apps/desktop/src-tauri/src/contract_client.rs`

## Test And Build Commands

- Root install: `pnpm install --frozen-lockfile`
- Root checks: `pnpm check`
- Root tests: `pnpm test`
- Root build: `pnpm build`
- Desktop TS tests: `pnpm --dir apps/desktop vitest run`
- Desktop dev app: `pnpm --dir apps/desktop tauri:dev`
- Moon desktop tasks: `moon run desktop:check`, `moon run desktop:test`, `moon run desktop:build`
- Rust desktop tests: `cargo test -p momo`
