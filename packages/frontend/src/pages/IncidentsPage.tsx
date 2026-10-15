import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Table, Modal, Form, Row, Col } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { incidentApi, getApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { SeverityBadge, StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function IncidentsPage() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', organizationId, statusFilter, severityFilter],
    queryFn: () => incidentApi.list({ status: statusFilter || undefined, severity: severityFilter || undefined, limit: 50 }),
    enabled: !!organizationId,
    refetchInterval: 30000,
  });

  const { data: statsData } = useQuery({
    queryKey: ['incident-stats', organizationId],
    queryFn: () => incidentApi.stats(),
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => incidentApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incidents'] }); setShowCreate(false); toast.success('Incident created'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const ackMutation = useMutation({
    mutationFn: (id: string) => incidentApi.acknowledge(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incidents'] }); toast.success('Acknowledged'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: string }) =>
      incidentApi.resolve(id, resolution),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incidents'] }); setResolveId(null); toast.success('Resolved'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    title: string; severity: string; description: string;
  }>();

  const onSubmit = (d: Record<string, string>) => {
    createMutation.mutate({ ...d, source: 'manual' });
    reset();
  };

  const incidents = data?.data?.incidents ?? [];
  const stats = statsData?.data;

  return (
    <>
      <PageHeader title="Incidents" subtitle="Track and respond to operational incidents"
        action={<Button variant="danger" size="sm" onClick={() => setShowCreate(true)}><i className="bi bi-plus-lg me-1"></i>Report Incident</Button>} />

      {stats && (
        <Row className="g-2 mb-3">
          {(['critical', 'high', 'medium'] as const).map(sev => {
            const count = stats.bySeverity?.find((x: { severity: string; _count: number }) => x.severity === sev)?._count ?? 0;
            return (
              <Col key={sev} xs="auto">
                <Button size="sm" variant={count > 0 && sev !== 'medium' ? 'danger' : 'outline-secondary'}
                  onClick={() => setSeverityFilter(sev === severityFilter ? '' : sev)}>
                  {sev.charAt(0).toUpperCase() + sev.slice(1)}: {count}
                </Button>
              </Col>
            );
          })}
        </Row>
      )}

      <div className="mb-3 d-flex gap-2 flex-wrap">
        {['', 'detected', 'acknowledged', 'investigating', 'resolved'].map(s => (
          <Button key={s} size="sm"
            variant={statusFilter === s ? 'primary' : 'outline-secondary'}
            onClick={() => setStatusFilter(s)}>
            {s || 'All'}
          </Button>
        ))}
      </div>

      <Card className="shadow-sm border-0">
        <Card.Body className="p-0">
          {isLoading ? <LoadingSpinner /> : incidents.length === 0 ? (
            <EmptyState icon="bi-check-circle" title="No incidents found" description="No incidents match the current filter." />
          ) : (
            <Table responsive hover className="mb-0 small">
              <thead className="table-light">
                <tr><th>Title</th><th>Severity</th><th>Status</th><th>Source</th><th>Created</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {incidents.map((inc: Record<string, unknown>) => (
                  <tr key={inc.id as string}>
                    <td>
                      <div className="fw-semibold">{inc.title as string}</div>
                      {Boolean(inc.description) && <div className="text-muted" style={{ fontSize: '0.75rem' }}>{String(inc.description).slice(0, 80)}…</div>}
                    </td>
                    <td><SeverityBadge severity={inc.severity as string} /></td>
                    <td><StatusBadge status={inc.status as string} /></td>
                    <td className="text-capitalize">{inc.source as string}</td>
                    <td>{new Date(inc.createdAt as string).toLocaleString()}</td>
                    <td className="d-flex gap-1">
                      {inc.status === 'detected' && (
                        <Button variant="outline-warning" size="sm" onClick={() => ackMutation.mutate(inc.id as string)}>
                          Ack
                        </Button>
                      )}
                      {inc.status !== 'resolved' && (
                        <Button variant="outline-success" size="sm" onClick={() => setResolveId(inc.id as string)}>
                          Resolve
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Create Modal */}
      <Modal show={showCreate} onHide={() => setShowCreate(false)}>
        <Modal.Header closeButton><Modal.Title>Report Incident</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmit(onSubmit)}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Title</Form.Label>
              <Form.Control isInvalid={!!errors.title} {...register('title', { required: 'Required' })} />
              <Form.Control.Feedback type="invalid">{errors.title?.message}</Form.Control.Feedback>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Severity</Form.Label>
              <Form.Select isInvalid={!!errors.severity} {...register('severity', { required: 'Required' })}>
                <option value="">Select…</option>
                {['critical', 'high', 'medium', 'low', 'info'].map(s => <option key={s} value={s}>{s}</option>)}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control as="textarea" rows={3} {...register('description')} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create Incident'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Resolve Modal */}
      <Modal show={!!resolveId} onHide={() => setResolveId(null)}>
        <Modal.Header closeButton><Modal.Title>Resolve Incident</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Resolution notes <span className="text-danger">*</span></Form.Label>
            <Form.Control as="textarea" rows={3} value={resolutionText}
              onChange={e => setResolutionText(e.target.value)}
              placeholder="Describe how the incident was resolved…" />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setResolveId(null)}>Cancel</Button>
          <Button variant="success" disabled={!resolutionText.trim() || resolveMutation.isPending}
            onClick={() => resolveId && resolveMutation.mutate({ id: resolveId, resolution: resolutionText })}>
            {resolveMutation.isPending ? 'Resolving…' : 'Mark Resolved'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
