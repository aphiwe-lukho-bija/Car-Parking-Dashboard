import type { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`panel ${className}`}>
      {title !== undefined && (
        <header className="panel__head">
          <div>
            <h2 className="panel__title">{title}</h2>
            {subtitle !== undefined && <p className="panel__subtitle">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? "panel__body" : undefined}>{children}</div>
    </section>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <h3 className="subhead">{children}</h3>;
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "live" | "warn" | "danger" | "gold";
  children: ReactNode;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function EmptyState({ message }: { message: string }) {
  return <p className="empty">{message}</p>;
}