import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Table, Modal, Form, Badge } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { documentApi, getApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function DocumentsPage() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editDoc, setEditDoc] = useState<Record<string, unknown> | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['documents', organizationId, typeFilter, statusFilter],
    queryFn: () => documentApi.list({ type: typeFilter || undefined, status: statusFilter || undefined }),
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => documentApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); setShowCreate(false); toast.success('Document created'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => documentApi.publish(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); toast.success('Published'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); toast.success('Deleted'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    title: string; type: string; content: string;
  }>();

  const onSubmit = (d: Record<string, unknown>) => {
    createMutation.mutate(d);
    reset();
  };

  const docs = data?.data?.documents ?? [];
  const DOC_TYPES = ['runbook', 'architecture', 'procedure', 'policy', 'handover', 'guide', 'other'];

  return (
    <>
      <PageHeader title="Documentation" subtitle="Operational runbooks, policies and procedures"
        action={<Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><i className="bi bi-plus-lg me-1"></i>New Document</Button>} />

      <div className="mb-3 d-flex gap-2 flex-wrap">
        <Button size="sm" variant={!typeFilter ? 'primary' : 'outline-secondary'} onClick={() => setTypeFilter('')}>All Types</Button>
        {DOC_TYPES.map(t => (
          <Button key={t} size="sm" variant={typeFilter === t ? 'primary' : 'outline-secondary'}
            onClick={() => setTypeFilter(t === typeFilter ? '' : t)} className="text-capitalize">{t}</Button>
        ))}
      </div>

      <div className="mb-3 d-flex gap-2">
        {['', 'draft', 'review', 'published'].map(s => (
          <Button key={s} size="sm" variant={statusFilter === s ? 'primary' : 'outline-secondary'}
            onClick={() => setStatusFilter(s)}>{s || 'All Status'}</Button>
        ))}
      </div>

      <Card className="shadow-sm border-0">
        <Card.Body className="p-0">
          {isLoading ? <LoadingSpinner /> : docs.length === 0 ? (
            <EmptyState icon="bi-file-text" title="No documents yet"
              description="Create runbooks, policies, and operational procedures."
              action={<Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>Create Document</Button>} />
          ) : (
            <Table responsive hover className="mb-0 small">
              <thead className="table-light">
                <tr><th>Title</th><th>Type</th><th>Status</th><th>Version</th><th>Updated</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {docs.map((d: Record<string, unknown>) => (
                  <tr key={d.id as string}>
                    <td className="fw-semibold">{d.title as string}</td>
                    <td><Badge bg="light" text="dark" className="text-capitalize">{d.type as string}</Badge></td>
                    <td><StatusBadge status={d.status as string} /></td>
                    <td>v{d.version as number}</td>
                    <td>{new Date(d.updatedAt as string).toLocaleDateString()}</td>
                    <td className="d-flex gap-1">
                      <Button variant="outline-secondary" size="sm" onClick={() => setEditDoc(d)}>View</Button>
                      {d.status !== 'published' && (
                        <Button variant="outline-success" size="sm" onClick={() => publishMutation.mutate(d.id as string)}>Publish</Button>
                      )}
                      <Button variant="outline-danger" size="sm"
                        onClick={() => { if (confirm('Delete this document?')) deleteMutation.mutate(d.id as string); }}>
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

      {/* Create Modal */}
      <Modal show={showCreate} onHide={() => setShowCreate(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>New Document</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmit(onSubmit)}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Title</Form.Label>
              <Form.Control isInvalid={!!errors.title} {...register('title', { required: 'Required' })} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Type</Form.Label>
              <Form.Select isInvalid={!!errors.type} {...register('type', { required: 'Required' })}>
                <option value="">Select…</option>
                {DOC_TYPES.map(t => <option key={t} value={t} className="text-capitalize">{t}</option>)}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Content (Markdown)</Form.Label>
              <Form.Control as="textarea" rows={10} isInvalid={!!errors.content}
                {...register('content', { required: 'Content required' })}
                placeholder="# Runbook Title&#10;&#10;## Overview&#10;&#10;Describe the procedure here..." />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create Document'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* View Modal */}
      <Modal show={!!editDoc} onHide={() => setEditDoc(null)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editDoc?.title as string}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editDoc && (
            <>
              <div className="d-flex gap-2 mb-3">
                <Badge bg="light" text="dark" className="text-capitalize">{editDoc.type as string}</Badge>
                <StatusBadge status={editDoc.status as string} />
                <span className="text-muted small">v{editDoc.version as number}</span>
              </div>
              <pre className="border rounded p-3 bg-light" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.9rem' }}>
                {editDoc.content as string}
              </pre>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setEditDoc(null)}>Close</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
