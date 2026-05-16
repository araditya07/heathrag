import type { ReactNode } from "react";

export function Panel({ children }: { children: ReactNode }) {
  return <div className="panel">{children}</div>;
}

export function PanelHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="panel-header">
      <div className="title-row">
        <h3>{title}</h3>
        {subtitle && <span className="subtitle">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

export function PanelBody({ children }: { children: ReactNode }) {
  return <div className="panel-body">{children}</div>;
}
