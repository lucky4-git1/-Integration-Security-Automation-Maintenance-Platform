import { Badge } from 'react-bootstrap';

const STATUS_VARIANTS: Record<string, string> = {
  // Generic
  active: 'success', enabled: 'success', healthy: 'success',
  pending: 'warning', running: 'primary', processing: 'primary',
  error: 'danger', failed: 'danger', critical: 'danger',
  disconnected: 'secondary', disabled: 'secondary', cancelled: 'secondary',
  succeeded: 'success', completed: 'success', resolved: 'success',
  detected: 'danger', acknowledged: 'warning', investigating: 'primary',
  open: 'danger', inProgress: 'warning', accepted: 'info', falsePositive: 'secondary',
  draft: 'secondary', review: 'warning', published: 'success',
  // Severity
  high: 'warning', medium: 'info', low: 'secondary', info: 'light',
};

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const variant = STATUS_VARIANTS[status] ?? 'secondary';
  return (
    <Badge bg={variant} className={`text-capitalize ${className}`}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const variants: Record<string, string> = {
    critical: 'danger', high: 'warning', medium: 'info', low: 'secondary', info: 'light',
  };
  return (
    <Badge bg={variants[severity] ?? 'secondary'} className="text-capitalize">
      {severity}
    </Badge>
  );
}
