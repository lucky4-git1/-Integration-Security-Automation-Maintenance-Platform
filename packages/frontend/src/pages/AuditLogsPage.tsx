import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Table, Badge, Form, Row, Col } from 'react-bootstrap';
import { auditApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function AuditLogsPage() {
  const { organizationId } = useAuth();
  const [page, setPage] = useState(1);
  const [resultFilter, setResultFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', organizationId, page, resultFilter, resourceFilter],
    queryFn: () => auditApi.logs({
      page, limit: 50,
      result: resultFilter || undefined,
      resource: resourceFilter || undefined,
    }),
    enabled: !!organizationId,
  });

  const logs = data?.data?.logs ?? [];
  const pagination = data?.data?.pagination;

  const resultVariant = (r: string) =>
    r === 'success' ? 'success' : r === 'denied' ? 'danger' : 'warning';

  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Complete record of privileged operations" />

      <Row className="g-2 mb-3">
        <Col xs="auto">
          <Form.Select size="sm" value={resultFilter} onChange={e => { setResultFilter(e.target.value); setPage(1); }}>
            <option value="">All Results</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="denied">Denied</option>
          </Form.Select>
        </Col>
        <Col xs="auto">
          <Form.Control size="sm" placeholder="Filter by resource…" value={resourceFilter}
            onChange={e => { setResourceFilter(e.target.value); setPage(1); }} />
        </Col>
      </Row>

      <Card className="shadow-sm border-0">
        <Card.Body className="p-0">
          {isLoading ? <LoadingSpinner /> : logs.length === 0 ? (
            <EmptyState icon="bi-journal-text" title="No audit logs" description="Privileged actions will appear here." />
          ) : (
            <>
              <Table responsive hover className="mb-0 small">
                <thead className="table-light">
                  <tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Resource</th><th>Result</th><th>IP</th></tr>
                </thead>
                <tbody>
                  {logs.map((log: Record<string, unknown>) => {
                    const user = log.user as Record<string, string> | null;
                    return (
                      <tr key={log.id as string}>
                        <td className="text-nowrap">{new Date(log.timestamp as string).toLocaleString()}</td>
                        <td>{user ? `${user.firstName} ${user.lastName}` : <span className="text-muted fst-italic">System</span>}</td>
                        <td className="font-monospace" style={{ fontSize: '0.75rem' }}>{log.action as string}</td>
                        <td>
                          <span className="text-muted text-capitalize">{log.resource as string}</span>
                          {Boolean(log.resourceId) && <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>#{String(log.resourceId).slice(0, 8)}</span>}
                        </td>
                        <td>
                          <Badge bg={resultVariant(log.result as string)}>{log.result as string}</Badge>
                        </td>
                        <td className="text-muted">{(log.ipAddress as string) || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              {pagination && pagination.totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center px-3 py-2 border-top">
                  <span className="small text-muted">Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)</span>
                  <div className="d-flex gap-1">
                    <Button size="sm" variant="outline-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                    <Button size="sm" variant="outline-secondary" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card.Body>
      </Card>
    </>
  );
}
