import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Table, Modal, Form, Row, Col, Alert } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { backupApi, getApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function BackupsPage() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [restoreBackupId, setRestoreBackupId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState('');
  const [tab, setTab] = useState<'policies' | 'backups'>('policies');

  const { data: policiesData, isLoading: policiesLoading } = useQuery({
    queryKey: ['backup-policies', organizationId],
    queryFn: () => backupApi.policies(),
    enabled: !!organizationId,
  });

  const { data: backupsData, isLoading: backupsLoading } = useQuery({
    queryKey: ['backups', organizationId],
    queryFn: () => backupApi.list({ limit: 50 }),
    enabled: !!organizationId && tab === 'backups',
  });

  const { data: statsData } = useQuery({
    queryKey: ['backup-stats', organizationId],
    queryFn: () => backupApi.stats(),
    enabled: !!organizationId,
  });

  const createPolicyMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => backupApi.createPolicy(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backup-policies'] }); setShowCreate(false); toast.success('Policy created'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => backupApi.runPolicy(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backups'] }); toast.success('Backup queued'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const deletePolicyMutation = useMutation({
    mutationFn: (id: string) => backupApi.deletePolicy(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backup-policies'] }); toast.success('Policy deleted'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const restoreMutation = useMutation({
    mutationFn: ({ id, target }: { id: string; target: string }) => backupApi.restore(id, target),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backups'] }); setRestoreBackupId(null); toast.success('Restore initiated — requires authorization'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    name: string; schedule: string; retentionDays: number; targetType: string; storageType: string;
  }>();

  const onSubmit = (d: Record<string, unknown>) => {
    createPolicyMutation.mutate({ ...d, targetConfig: {}, storageConfig: {} });
    reset();
  };

  const stats = statsData?.data ?? {};
  const policies = policiesData?.data?.policies ?? [];
  const backups = backupsData?.data?.backups ?? [];

  return (
    <>
      <PageHeader title="Backups & Recovery" subtitle="Manage backup policies and restore operations"
        action={<Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><i className="bi bi-plus-lg me-1"></i>New Policy</Button>} />

      <Row className="g-2 mb-4">
        <Col xs={6} md={3}>
          <Card className="border-0 shadow-sm text-center py-2">
            <div className="fs-4 fw-bold text-primary">{stats.totalPolicies ?? 0}</div>
            <div className="small text-muted">Active Policies</div>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="border-0 shadow-sm text-center py-2">
            <div className="fs-4 fw-bold text-success">{stats.recentBackups ?? 0}</div>
            <div className="small text-muted">Backups (24h)</div>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="border-0 shadow-sm text-center py-2">
            <div className="fs-4 fw-bold text-info">{stats.totalBackups ?? 0}</div>
            <div className="small text-muted">Total Backups</div>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className={`border-0 shadow-sm text-center py-2 ${stats.failedBackups > 0 ? 'border-danger' : ''}`}>
            <div className={`fs-4 fw-bold ${stats.failedBackups > 0 ? 'text-danger' : 'text-secondary'}`}>{stats.failedBackups ?? 0}</div>
            <div className="small text-muted">Failed</div>
          </Card>
        </Col>
      </Row>

      <div className="mb-3 d-flex gap-2">
        <Button size="sm" variant={tab === 'policies' ? 'primary' : 'outline-secondary'} onClick={() => setTab('policies')}>Policies</Button>
        <Button size="sm" variant={tab === 'backups' ? 'primary' : 'outline-secondary'} onClick={() => setTab('backups')}>Backup History</Button>
      </div>

      {tab === 'policies' && (
        <Card className="shadow-sm border-0">
          <Card.Body className="p-0">
            {policiesLoading ? <LoadingSpinner /> : policies.length === 0 ? (
              <EmptyState icon="bi-cloud-upload" title="No backup policies" description="Create a backup policy to protect your data." />
            ) : (
              <Table responsive hover className="mb-0 small">
                <thead className="table-light">
                  <tr><th>Name</th><th>Target</th><th>Schedule</th><th>Retention</th><th>Last Backup</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {policies.map((p: Record<string, unknown>) => (
                    <tr key={p.id as string}>
                      <td className="fw-semibold">{p.name as string}</td>
                      <td className="text-capitalize">{p.targetType as string}</td>
                      <td className="font-monospace">{p.schedule as string}</td>
                      <td>{p.retentionDays as number} days</td>
                      <td>{p.lastBackupAt ? new Date(p.lastBackupAt as string).toLocaleString() : <span className="text-warning">Never</span>}</td>
                      <td className="d-flex gap-1">
                        <Button variant="outline-primary" size="sm" onClick={() => runMutation.mutate(p.id as string)}>Run</Button>
                        <Button variant="outline-danger" size="sm"
                          onClick={() => { if (confirm('Delete this policy?')) deletePolicyMutation.mutate(p.id as string); }}>
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
      )}

      {tab === 'backups' && (
        <Card className="shadow-sm border-0">
          <Card.Body className="p-0">
            {backupsLoading ? <LoadingSpinner /> : backups.length === 0 ? (
              <EmptyState icon="bi-archive" title="No backups yet" description="Run a backup policy to see results here." />
            ) : (
              <Table responsive hover className="mb-0 small">
                <thead className="table-light">
                  <tr><th>Name</th><th>Status</th><th>Size</th><th>Verified</th><th>Created</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {backups.map((b: Record<string, unknown>) => (
                    <tr key={b.id as string}>
                      <td className="fw-semibold">{b.name as string}</td>
                      <td><StatusBadge status={b.status as string} /></td>
                      <td>{b.size ? `${(Number(b.size) / 1024 / 1024).toFixed(1)} MB` : '—'}</td>
                      <td>{b.verified ? <span className="text-success"><i className="bi bi-check-circle-fill"></i></span> : <span className="text-muted">—</span>}</td>
                      <td>{new Date(b.createdAt as string).toLocaleString()}</td>
                      <td>
                        {b.status === 'completed' && Boolean(b.verified) && (
                          <Button variant="outline-warning" size="sm" onClick={() => setRestoreBackupId(b.id as string)}>Restore</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card.Body>
        </Card>
      )}

      {/* Create Policy Modal */}
      <Modal show={showCreate} onHide={() => setShowCreate(false)}>
        <Modal.Header closeButton><Modal.Title>New Backup Policy</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmit(onSubmit)}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Policy Name</Form.Label>
              <Form.Control isInvalid={!!errors.name} {...register('name', { required: 'Required' })} />
            </Form.Group>
            <Row>
              <Col>
                <Form.Group className="mb-3">
                  <Form.Label>Target Type</Form.Label>
                  <Form.Select {...register('targetType', { required: true })}>
                    <option value="database">Database</option>
                    <option value="files">Files</option>
                    <option value="configuration">Configuration</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col>
                <Form.Group className="mb-3">
                  <Form.Label>Storage</Form.Label>
                  <Form.Select {...register('storageType', { required: true })}>
                    <option value="local">Local</option>
                    <option value="s3">Amazon S3</option>
                    <option value="azure">Azure Blob</option>
                    <option value="gcs">GCS</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Schedule (cron)</Form.Label>
              <Form.Control placeholder="0 2 * * *" {...register('schedule', { required: 'Required' })} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Retention (days)</Form.Label>
              <Form.Control type="number" defaultValue={30} {...register('retentionDays', { valueAsNumber: true })} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={createPolicyMutation.isPending}>
              {createPolicyMutation.isPending ? 'Creating…' : 'Create Policy'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Restore Modal */}
      <Modal show={!!restoreBackupId} onHide={() => setRestoreBackupId(null)}>
        <Modal.Header closeButton><Modal.Title>Initiate Restore</Modal.Title></Modal.Header>
        <Modal.Body>
          <Alert variant="warning"><i className="bi bi-exclamation-triangle me-2"></i>This action requires authorization before executing. Data will not be overwritten until explicitly approved.</Alert>
          <Form.Group>
            <Form.Label>Target Environment</Form.Label>
            <Form.Control value={restoreTarget} onChange={e => setRestoreTarget(e.target.value)} placeholder="e.g. staging, dr-environment" />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setRestoreBackupId(null)}>Cancel</Button>
          <Button variant="warning" disabled={!restoreTarget.trim() || restoreMutation.isPending}
            onClick={() => restoreBackupId && restoreMutation.mutate({ id: restoreBackupId, target: restoreTarget })}>
            {restoreMutation.isPending ? 'Initiating…' : 'Request Restore'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
