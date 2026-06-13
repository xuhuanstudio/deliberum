import { useQuery } from "@tanstack/react-query";
import {
  DataPanel,
  EmptyState,
  JsonBlock,
  PageHeader,
  StatusBanner
} from "@deliberum/ui";
import { useState, type ReactNode } from "react";
import { useDaemonRuntime } from "./daemon-runtime";

export type ViewFrameProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
};

export type AdvancedDetailsProps = {
  summary?: string;
  description?: string;
  lazy?: boolean;
  onOpen?: () => void;
  children: ReactNode;
};

export function ViewFrame({
  eyebrow,
  title,
  description,
  actions,
  children
}: ViewFrameProps) {
  return (
    <div className="du-view">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
      />
      <div className="du-view-body">{children}</div>
    </div>
  );
}

export function AdvancedDetails({
  summary = "Advanced / Developer Mode",
  description,
  lazy = false,
  onOpen,
  children
}: AdvancedDetailsProps) {
  const [hasOpened, setHasOpened] = useState(false);
  const shouldRenderChildren = !lazy || hasOpened;

  return (
    <details
      className="du-advanced-panel"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setHasOpened(true);
          onOpen?.();
        }
      }}
    >
      <summary>{summary}</summary>
      {description ? <p className="du-advanced-description">{description}</p> : null}
      {shouldRenderChildren ? <div className="du-advanced-stack">{children}</div> : null}
    </details>
  );
}

export function DaemonStatus() {
  const { client } = useDaemonRuntime();
  const healthQuery = useQuery({
    queryKey: ["daemon-health"],
    queryFn: () => client.health(),
    retry: false
  });

  if (healthQuery.isLoading) {
    return <StatusBanner title="Checking daemon" />;
  }

  if (healthQuery.isError) {
    return (
      <StatusBanner
        tone="warning"
        title="Daemon unavailable"
        detail="Views will retry when routes request data."
      />
    );
  }

  if (!healthQuery.data) {
    return <StatusBanner title="Daemon status unavailable" />;
  }

  return (
    <StatusBanner
      tone="ok"
      title="Daemon online"
      detail={`${healthQuery.data.service} on ${healthQuery.data.host}:${healthQuery.data.port}`}
    />
  );
}

export type QueryStateProps = {
  query: {
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
  };
  children: ReactNode;
};

export function QueryState({ query, children }: QueryStateProps) {
  if (query.isLoading) {
    return <StatusBanner title="Loading discussion data" />;
  }

  if (query.isError) {
    return (
      <StatusBanner
        tone="error"
        title="Could not load discussion data"
        detail={formatSafeErrorMessage(query.error)}
      />
    );
  }

  return children;
}

export type RecordCollectionProps = {
  title: string;
  records: unknown[];
  emptyTitle: string;
  emptyDescription: string;
};

export function RecordCollection({
  title,
  records,
  emptyTitle,
  emptyDescription
}: RecordCollectionProps) {
  return (
    <DataPanel title={title}>
      {records.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="du-record-list">
          {records.map((record, index) => (
            <JsonBlock
              key={getRecordKey(record, index)}
              label={String(getRecordValue(record, "id") ?? `Record ${index + 1}`)}
              value={record}
            />
          ))}
        </div>
      )}
    </DataPanel>
  );
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function getRecordValue(record: unknown, key: string): unknown {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return undefined;
  }

  return (record as Record<string, unknown>)[key];
}

export function getStringRecordValue(record: unknown, key: string): string | undefined {
  const value = getRecordValue(record, key);

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function formatRecordValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "None";
}

export function sanitizeForDisplay(value: unknown): unknown {
  if (typeof value === "string") {
    return redactUnsafeText(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForDisplay(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSecretLikeKey(key) ? "[redacted]" : sanitizeForDisplay(nestedValue)
    ])
  );
}

export function formatSafeErrorMessage(error: Error | null | undefined): string {
  if (!error?.message) {
    return "The service did not return a usable response.";
  }

  return redactUnsafeText(error.message.split("\n")[0] ?? error.message);
}

function getRecordKey(record: unknown, fallback: number): string {
  const id = getRecordValue(record, "id");

  return typeof id === "string" && id.length > 0 ? id : `record-${fallback}`;
}

function redactUnsafeText(value: string): string {
  return value
    .replace(/bearer\s+[a-z0-9._~+/-]{4,}/gi, "Bearer [redacted]")
    .replace(/\bsk-[a-z0-9_-]{4,}\b/gi, "[redacted_secret]")
    .replace(
      /\b(api[_-]?key|secret|access[_-]?token|private[_-]?token|authorization)=\S+/gi,
      "$1=[redacted]"
    )
    .replace(/\/Users\/[^\s"]+/g, "[redacted_path]")
    .replace(/\/home\/[^\s"]+/g, "[redacted_path]")
    .replace(/\/private\/[^\s"]+/g, "[redacted_path]")
    .replace(/~\/\.ssh\/[^\s"]+/g, "[redacted_path]")
    .replace(/[A-Z]:\\Users\\[^\s"]+/g, "[redacted_path]");
}

function isSecretLikeKey(key: string): boolean {
  const normalized = key.replace(/[-_\s]/g, "").toLowerCase();

  return [
    "apikey",
    "authorization",
    "authtoken",
    "accesstoken",
    "refreshtoken",
    "secret",
    "clientsecret",
    "password",
    "privatekey",
    "privatetoken",
    "credential",
    "credentials"
  ].includes(normalized);
}
