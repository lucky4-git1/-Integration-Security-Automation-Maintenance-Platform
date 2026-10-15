import { Spinner } from 'react-bootstrap';

export function LoadingSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="d-flex justify-content-center align-items-center py-5">
      <Spinner animation="border" size="sm" className="me-2" />
      <span className="text-muted">{label}</span>
    </div>
  );
}
