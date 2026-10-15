import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button, Card, Table, Badge, Modal, Form } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { integrationApi, getApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function IntegrationsPage() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['integrations', organizationId],
    queryFn: () => integrationApi.list(),
    enabled: !!organizationId,
  });

  const { data: providers } = useQuery({
    queryKey: ['integration-providers'],
    queryFn: () => integrationApi.providers(),
  });

  const createMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => integrationApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
      setShowCreate(false);
      toast.success('Integration created');
    },
    onError: (err) => toast.error(getApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => integrationApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['integrations'] }); toast.success('Integration deleted'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const r = await integrationApi.test(id);
      if (r.data.success) toast.success(`Connection OK — ${r.data.message}`);
      else toast.error(`Connection failed: ${r.data.message}`);
      qc.invalidateQueries({ queryKey: ['integrations'] });
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setTestingId(null);
    }
  };

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    name: string; provider: string; credentialToken: string;
  }>();

  const onSubmit = (d: { name: string; provider: string; credentialToken: string }) => {
    createMutation.mutate({
      name: d.name,
      provider: d.provider,
      config: {},
      credentials: { accessToken: d.credentialToken },
    });
    reset();
  };

  const integrations = data?.data?.integrations ?? [];

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Manage external service connections"
        action={
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <i className="bi bi-plus-lg me-1"></i> Connect Service
          </Button>
        }
      />

      <Card className="shadow-sm border-0">
        <Card.Body className="p-0">
          {isLoading ? <LoadingSpinner /> : integrations.length === 0 ? (
            <EmptyState
              icon="bi-plug"
              title="No integrations yet"
              description="Connect GitHub, Slack, or any HTTP service to get started."
              action={<Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>Connect Service</Button>}
            />
          ) : (
            <Table responsive hover className="mb-0">
              <thead className="table-light">
                <tr>
                  <th>Name</th><th>Provider</th><th>Status</th>
                  <th>Last Sync</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((integ: Record<string, unknown>) => (
                  <tr key={integ.id as string}>
                    <td>
                      <Link to={`/integrations/${integ.id}`} className="fw-semibold text-decoration-none">
                        {integ.name as string}
                      </Link>
                    </td>
                    <td><Badge bg="light" text="dark" className="text-capitalize">{integ.provider as string}</Badge></td>
                    <td><StatusBadge status={integ.status as string} /></td>
                    <td className="small text-muted">
                      {integ.lastSyncAt ? new Date(integ.lastSyncAt as string).toLocaleString() : '—'}
                    </td>
                    <td>
                      <Button variant="outline-secondary" size="sm" className="me-1"
                        onClick={() => handleTest(integ.id as string)}
                        disabled={testingId === integ.id as string}>
                        {testingId === integ.id ? <span className="spinner-border spinner-border-sm" /> : 'Test'}
                      </Button>
                      <Button variant="outline-danger" size="sm"
                        onClick={() => { if (confirm(`Delete "${integ.name}"?`)) deleteMutation.mutate(integ.id as string); }}>
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
        <Modal.Header closeButton><Modal.Title>Connect Service</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmit(onSubmit)}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Integration Name</Form.Label>
              <Form.Control isInvalid={!!errors.name} placeholder="e.g. Production GitHub"
                {...register('name', { required: 'Name is required' })} />
              <Form.Control.Feedback type="invalid">{errors.name?.message}</Form.Control.Feedback>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Provider</Form.Label>
              <Form.Select isInvalid={!!errors.provider} {...register('provider', { required: 'Provider required' })}>
                <option value="">Select provider…</option>
                {(providers?.data?.providers ?? []).map((p: { provider: string; displayName: string }) => (
                  <option key={p.provider} value={p.provider}>{p.displayName}</option>
                ))}
              </Form.Select>
              <Form.Control.Feedback type="invalid">{errors.provider?.message}</Form.Control.Feedback>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Access Token / API Key</Form.Label>
              <Form.Control type="password" placeholder="Paste credential"
                {...register('credentialToken', { required: 'Credential required' })}
                isInvalid={!!errors.credentialToken} />
              <Form.Text className="text-muted">Stored encrypted. Never shown again after save.</Form.Text>
              <Form.Control.Feedback type="invalid">{errors.credentialToken?.message}</Form.Control.Feedback>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Connecting…' : 'Connect'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
