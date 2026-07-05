type ChatPanelProvider = "gemini" | "remote";

interface RemotePermissionGate {
  readonly codexReady: boolean;
  readonly provider: ChatPanelProvider;
  readonly configLoading: boolean;
  readonly authenticated: boolean;
  readonly pluginAuthorized: boolean;
}

function shouldBlockRemotePermission(gate: RemotePermissionGate): boolean {
  if (gate.codexReady) return false;
  return (
    gate.provider === "remote" &&
    !gate.configLoading &&
    gate.authenticated &&
    !gate.pluginAuthorized
  );
}

export { shouldBlockRemotePermission };
export type { RemotePermissionGate };
