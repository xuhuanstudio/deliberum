import { createContext, useContext, type ReactNode } from "react";
import type { WebDaemonClient } from "./client";

export type DaemonRuntime = {
  client: WebDaemonClient;
  daemonBaseUrl: string;
};

const DaemonRuntimeContext = createContext<DaemonRuntime | undefined>(undefined);

export type DaemonRuntimeProviderProps = DaemonRuntime & {
  children: ReactNode;
};

export function DaemonRuntimeProvider({
  client,
  daemonBaseUrl,
  children
}: DaemonRuntimeProviderProps) {
  return (
    <DaemonRuntimeContext.Provider value={{ client, daemonBaseUrl }}>
      {children}
    </DaemonRuntimeContext.Provider>
  );
}

export function useDaemonRuntime(): DaemonRuntime {
  const runtime = useContext(DaemonRuntimeContext);

  if (!runtime) {
    throw new Error("Daemon runtime is not configured.");
  }

  return runtime;
}
