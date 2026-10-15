import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Card, Table, Button } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { automationApi, getApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function ExecutionsPage() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['executions', organizationId, statusFilter],
    queryFn: () => automationApi.executions({ status: statusFilter || undefined, limit: 50 }),
    enabled: !!organizationId,
    refetchInterval: 10000, // auto-refresh every 10s
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => automationApi.cancelExecution(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['executions'] }); toast.success('Cancelled'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const executions = data?.data?.executions ?? [];

  const durationLabel = (ms: number | null) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <>
      <PageHeader title="Execution Log" subtitle="Track automation execution history" />

      <div className="mb-3 d-flex gap-2 flex-wrap">
        {['', 'queued', 'running', 'succeeded', 'failed', 'timeout', 'cancelled'].map(s => (
          <Button key={s} size="sm"
            variant={statusFilter === s ? 'primary' : 'outline-secondary'}
            onClick={() => setSearchParams(s ? { status: s } : {})}>
            {s || 'All'}
          </Button>
        ))}
      </div>

      <Card className="shadow-sm border-0">
        <Card.Body className="p-0">
          {isLoading ? <LoadingSpinner /> : executions.length === 0 ? (
            <EmptyState icon="bi-list-task" title="No executions found" description="Executions will appear here when automations run." />
          ) : (
            <Table responsive hover className="mb-0 small">
              <thead className="table-light">
                <tr><th>Automation</th><th>Trigger</th><th>Status</th><th>Started</th><th>Duration</th><th>Attempt</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {executions.map((e: Record<string, unknown>) => {
                  const auto = e.automation as Record<string, unknown>;
                  return (
                    <tr key={e.id as string}>
                      <td>
                        <span className="fw-semibold">{String(auto?.name ?? 'Unknown')}</span>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{(e.id as string).slice(0, 8)}…</div>
                      </td>
                      <td className="text-capitalize">{e.trigger as string}</td>
                      <td><StatusBadge status={e.status as string} /></td>
                      <td>{e.startedAt ? new Date(e.startedAt as string).toLocaleString() : '—'}</td>
                      <td>{durationLabel(e.duration as number | null)}</td>
                      <td>{e.attempt as number}/{e.maxAttempts as number}</td>
                      <td>
                        {['queued', 'running'].includes(e.status as string) && (
                          <Button variant="outline-warning" size="sm"
                            onClick={() => cancelMutation.mutate(e.id as string)}>
                            Cancel
                          </Button>
                        )}
                        {Boolean(e.error) && (
                          <span className="text-danger small ms-1" title={e.error as string}>
                            <i className="bi bi-exclamation-circle"></i>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
    </>
  );
}
