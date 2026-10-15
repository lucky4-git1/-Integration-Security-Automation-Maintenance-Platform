import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="d-flex justify-content-between align-items-start mb-4">
      <div>
        <h4 className="fw-bold mb-0">{title}</h4>
        {subtitle && <p className="text-muted mb-0 small mt-1">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
