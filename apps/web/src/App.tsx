import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useState } from "react";
import {
  createWebDaemonClient,
  resolveDaemonBaseUrl,
  type WebDaemonClient
} from "./client";
import { DaemonRuntimeProvider } from "./daemon-runtime";
import { I18nProvider, type WebLanguage } from "./i18n";
import { createAppRouter, type AppRouter } from "./routes";

export type AppProps = {
  daemonClient?: WebDaemonClient;
  daemonBaseUrl?: string;
  queryClient?: QueryClient;
  router?: AppRouter;
  initialPath?: string;
  initialLanguage?: WebLanguage;
};

export function App({
  daemonClient,
  daemonBaseUrl,
  queryClient,
  router,
  initialPath,
  initialLanguage
}: AppProps) {
  const [resolvedBaseUrl] = useState(() => daemonBaseUrl ?? resolveDaemonBaseUrl());
  const [resolvedDaemonClient] = useState(
    () => daemonClient ?? createWebDaemonClient(resolvedBaseUrl)
  );
  const [resolvedQueryClient] = useState(() => queryClient ?? createWebQueryClient());
  const [resolvedRouter] = useState(
    () =>
      router ??
      createAppRouter({
        initialPath
      })
  );

  return (
    <I18nProvider initialLanguage={initialLanguage}>
      <DaemonRuntimeProvider
        client={resolvedDaemonClient}
        daemonBaseUrl={resolvedBaseUrl}
      >
        <QueryClientProvider client={resolvedQueryClient}>
          <RouterProvider router={resolvedRouter} />
        </QueryClientProvider>
      </DaemonRuntimeProvider>
    </I18nProvider>
  );
}

export function createWebQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });
}
