import type { ReactNode } from "react";

export type WorkspaceShellProps = {
  productName: string;
  workspaceLabel: string;
  sessionId?: string;
  daemonBaseUrl?: string;
  navigation?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
};

export function WorkspaceShell({
  productName,
  workspaceLabel,
  sessionId,
  daemonBaseUrl,
  navigation,
  status,
  children
}: WorkspaceShellProps) {
  return (
    <div className="du-workspace-shell">
      <aside className="du-sidebar" aria-label="Workspace navigation">
        <div className="du-brand">
          <span className="du-brand-mark" aria-hidden="true" />
          <div>
            <p className="du-kicker">{workspaceLabel}</p>
            <h1>{productName}</h1>
          </div>
        </div>
        {sessionId ? (
          <div className="du-session-chip">
            <span>Discussion</span>
            <strong>{sessionId}</strong>
          </div>
        ) : null}
        {navigation ? <nav className="du-nav">{navigation}</nav> : null}
        <div className="du-sidebar-footer">
          {daemonBaseUrl ? (
            <p>
              Service
              <span>{daemonBaseUrl}</span>
            </p>
          ) : null}
          {status}
        </div>
      </aside>
      <main className="du-main">{children}</main>
    </div>
  );
}

export type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="du-page-header">
      <div>
        {eyebrow ? <p className="du-kicker">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="du-page-actions">{actions}</div> : null}
    </header>
  );
}

export type DataPanelProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function DataPanel({ title, description, children }: DataPanelProps) {
  return (
    <section className="du-panel">
      <div className="du-panel-heading">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="du-empty-state" role="status">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export type StatusBannerTone = "neutral" | "ok" | "warning" | "error";

export type StatusBannerProps = {
  tone?: StatusBannerTone;
  title: string;
  detail?: string;
};

export function StatusBanner({ tone = "neutral", title, detail }: StatusBannerProps) {
  return (
    <div className={`du-status du-status-${tone}`} role="status">
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

export type JsonBlockProps = {
  label?: string;
  value: unknown;
};

export function JsonBlock({ label, value }: JsonBlockProps) {
  return (
    <figure className="du-json-block">
      {label ? <figcaption>{label}</figcaption> : null}
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </figure>
  );
}

export type KeyValueGridProps = {
  items: readonly {
    label: string;
    value: ReactNode;
  }[];
};

export function KeyValueGrid({ items }: KeyValueGridProps) {
  return (
    <dl className="du-key-value-grid">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
