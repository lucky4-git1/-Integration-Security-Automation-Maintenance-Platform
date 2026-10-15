import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Row, Col, Modal, Form } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-toastify';
import { orgApi, getApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const createSchema = z.object({
  name: z.string().min(1, 'Name required'),
  slug: z.string().min(1, 'Slug required').regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
});
type CreateForm = z.infer<typeof createSchema>;

export function OrganizationsPage() {
  const { setOrganization } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => orgApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (d: CreateForm) => orgApi.create(d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['organizations'] });
      const orgId = res.data.organization.id;
      setOrganization(orgId);
      toast.success('Organization created');
      setShowCreate(false);
      navigate('/dashboard');
    },
    onError: (err) => toast.error(getApiError(err)),
  });

  const { register, handleSubmit, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });

  const orgs = data?.data?.organizations ?? [];

  const handleSelect = (id: string) => {
    setOrganization(id);
    navigate('/dashboard');
  };

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-0">Select Organization</h4>
          <p className="text-muted small mb-0">Choose an organization to manage</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          <i className="bi bi-plus-lg me-1"></i> New Organization
        </Button>
      </div>

      {isLoading ? <LoadingSpinner /> : orgs.length === 0 ? (
        <Card className="text-center py-5 border-0 shadow-sm">
          <Card.Body>
            <i className="bi bi-building display-4 text-muted"></i>
            <h5 className="mt-3">No organizations yet</h5>
            <p className="text-muted">Create your first organization to get started.</p>
            <Button variant="primary" onClick={() => setShowCreate(true)}>Create Organization</Button>
          </Card.Body>
        </Card>
      ) : (
        <Row className="g-3">
          {orgs.map((org: Record<string, unknown>) => {
            const counts = org._count as Record<string, number>;
            return (
              <Col key={org.id as string} xs={12} sm={6} lg={4}>
                <Card className="shadow-sm border-0 h-100 hover-shadow" style={{ cursor: 'pointer' }}
                  onClick={() => handleSelect(org.id as string)}>
                  <Card.Body>
                    <div className="d-flex align-items-start gap-3 mb-3">
                      <div className="bg-primary bg-opacity-10 rounded p-2">
                        <i className="bi bi-building fs-4 text-primary"></i>
                      </div>
                      <div>
                        <Card.Title className="mb-0">{org.name as string}</Card.Title>
                        <div className="text-muted small">/{org.slug as string}</div>
                      </div>
                    </div>
                    <div className="d-flex gap-3 text-muted small">
                      <span><i className="bi bi-people me-1"></i>{counts?.members ?? 0} members</span>
                      <span><i className="bi bi-plug me-1"></i>{counts?.integrations ?? 0} integrations</span>
                      <span><i className="bi bi-gear me-1"></i>{counts?.automations ?? 0} automations</span>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Modal show={showCreate} onHide={() => setShowCreate(false)}>
        <Modal.Header closeButton><Modal.Title>Create Organization</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmit(d => createMutation.mutate(d))}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Organization Name</Form.Label>
              <Form.Control isInvalid={!!errors.name} {...register('name')} placeholder="Acme Corp" />
              <Form.Control.Feedback type="invalid">{errors.name?.message}</Form.Control.Feedback>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Slug</Form.Label>
              <Form.Control isInvalid={!!errors.slug} {...register('slug')} placeholder="acme-corp" />
              <Form.Text className="text-muted">URL-friendly identifier. Lowercase, no spaces.</Form.Text>
              <Form.Control.Feedback type="invalid">{errors.slug?.message}</Form.Control.Feedback>
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
    </div>
  );
}
