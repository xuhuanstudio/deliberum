import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { createDaemonApp, type DaemonApp, type DaemonAppOptions } from "./app";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "./config";

export { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT };

export type StartDaemonOptions = DaemonAppOptions & {
  onListening?: (address: { host: string; port: number }) => void;
};

export type StartedDaemon = DaemonApp & {
  server: ServerType;
};

export function startDaemon(options: StartDaemonOptions = {}): StartedDaemon {
  const host = options.host ?? DEFAULT_DAEMON_HOST;
  const port = options.port ?? DEFAULT_DAEMON_PORT;
  const daemon = createDaemonApp({
    ...options,
    host,
    port
  });
  const server = serve(
    {
      fetch: daemon.app.fetch,
      hostname: host,
      port
    },
    () => {
      options.onListening?.({ host, port });
    }
  );

  return {
    ...daemon,
    server
  };
}
