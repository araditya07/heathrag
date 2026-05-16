import type { ReactNode } from "react";

export default function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1 className="title">{title}</h1>
        {subtitle && <div className="subtitle">{subtitle}</div>}
      </div>
      {children && <div className="page-controls">{children}</div>}
    </div>
  );
}
