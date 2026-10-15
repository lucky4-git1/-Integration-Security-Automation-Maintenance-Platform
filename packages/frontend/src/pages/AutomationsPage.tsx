import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button, Card, Table, Badge, Modal, Form } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { automationApi, getApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function AutomationsPage() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['automations', organizationId],
    queryFn: () => automationApi.list(),
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => automationApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['automations'] }); setShowCreate(false); toast.success('Automation created'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => automationApi.toggle(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['automations'] }); toast.success('Updated'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => automationApi.run(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['automations'] }); toast.success('Run queued'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => automationApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['automations'] }); toast.success('Deleted'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    name: string; type: string; schedule: string; description: string;
  }>();

  const onSubmit = (d: Record<string, string>) => {
    createMutation.mutate({ name: d.name, type: d.type, schedule: d.schedule || undefined, description: d.description || undefined, config: {} });
    reset();
  };

  const automations = data?.data?.automations ?? [];

  return (
    <>
      <PageHeader title="Automations" subtitle="Manage scheduled jobs and workflows"
        action={<Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><i className="bi bi-plus-lg me-1"></i>New Automation</Button>} />

      <Card className="shadow-sm border-0">
        <Card.Body className="p-0">
          {isLoading ? <LoadingSpinner /> : automations.length === 0 ? (
            <EmptyState icon="bi-gear-wide-connected" title="No automations yet"
              description="Create scheduled jobs, webhook triggers, or manual workflows."
              action={<Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>Create Automation</Button>} />
          ) : (
            <Table responsive hover className="mb-0">
              <thead className="table-light">
                <tr><th>Name</th><th>Type</th><th>Schedule</th><th>Status</th><th>Executions</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {automations.map((a: Record<string, unknown>) => (
                  <tr key={a.id as string}>
                    <td>
                      <Link to={`/automations/${a.id}`} className="fw-semibold text-decoration-none">{a.name as string}</Link>
                      {Boolean(a.description) && <div className="small text-muted">{String(a.description)}</div>}
                    </td>
                    <td><Badge bg="light" text="dark" className="text-capitalize">{a.type as string}</Badge></td>
                    <td className="small font-monospace">{(a.schedule as string) || '—'}</td>
                    <td>
                      <StatusBadge status={a.enabled ? 'active' : 'disabled'} />
                    </td>
                    <td className="small">{(a._count as Record<string, number>)?.executions ?? 0}</td>
                    <td className="d-flex gap-1">
                      <Button variant="outline-success" size="sm" onClick={() => runMutation.mutate(a.id as string)} title="Run now">
                        <i className="bi bi-play-fill"></i>
                      </Button>
                      <Button variant={a.enabled ? 'outline-warning' : 'outline-secondary'} size="sm"
                        onClick={() => toggleMutation.mutate(a.id as string)} title={a.enabled ? 'Disable' : 'Enable'}>
                        <i className={`bi bi-${a.enabled ? 'pause-fill' : 'play-circle'}`}></i>
                      </Button>
                      <Button variant="outline-danger" size="sm"
                        onClick={() => { if (confirm(`Delete "${a.name}"?`)) deleteMutation.mutate(a.id as string); }}>
                        <i className="bi bi-trash"></i>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      <Modal show={showCreate} onHide={() => setShowCreate(false)}>
        <Modal.Header closeButton><Modal.Title>New Automation</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmit(onSubmit)}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Name</Form.Label>
              <Form.Control isInvalid={!!errors.name} {...register('name', { required: 'Name required' })} />
              <Form.Control.Feedback type="invalid">{errors.name?.message}</Form.Control.Feedback>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Type</Form.Label>
              <Form.Select isInvalid={!!errors.type} {...register('type', { required: 'Type required' })}>
                <option value="">Select type…</option>
                <option value="scheduled">Scheduled (cron)</option>
                <option value="manual">Manual</option>
                <option value="webhook">Webhook</option>
                <option value="api">API</option>
              </Form.Select>
              <Form.Control.Feedback type="invalid">{errors.type?.message}</Form.Control.Feedback>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Schedule (cron expression)</Form.Label>
              <Form.Control placeholder="e.g. 0 2 * * * (daily at 2am)" {...register('schedule')} />
              <Form.Text className="text-muted">Leave empty for manual/webhook automations.</Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control as="textarea" rows={2} {...register('description')} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
