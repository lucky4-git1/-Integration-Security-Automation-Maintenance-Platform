import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Table, Modal, Form, Row, Col, Badge } from 'react-bootstrap';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { orgApi, getApiError, api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';

export function SettingsPage() {
  const { organizationId, user } = useAuth();
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);

  const { data: orgData } = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () => orgApi.get(organizationId!),
    enabled: !!organizationId,
  });

  const { data: membersData, isLoading } = useQuery({
    queryKey: ['members', organizationId],
    queryFn: () => orgApi.listMembers(organizationId!),
    enabled: !!organizationId,
  });

  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      // Fetch roles from the seeded system roles
      return api.get('/organizations/' + organizationId + '/members').then((r: { data: unknown }) => r.data);
    },
    enabled: false, // Roles come from members
  });
  void rolesData; // suppress unused warning

  const inviteMutation = useMutation({
    mutationFn: (d: { email: string; roleId: string }) => orgApi.addMember(organizationId!, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); setShowInvite(false); toast.success('Member added'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => orgApi.removeMember(organizationId!, memberId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); toast.success('Member removed'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ email: string; roleId: string }>();

  const org = orgData?.data?.organization;
  const members = membersData?.data?.members ?? [];

  // Extract available roles from existing members
  const roles = [...new Map(members.map((m: Record<string, unknown>) => {
    const r = m.role as Record<string, string>;
    return [r.id, r];
  })).values()] as Array<{ id: string; name: string }>;

  return (
    <>
      <PageHeader title="Organization Settings" subtitle="Manage members, roles, and organization configuration" />

      {org && (
        <Card className="shadow-sm border-0 mb-4">
          <Card.Header className="bg-transparent border-bottom"><span className="fw-semibold">Organization Details</span></Card.Header>
          <Card.Body>
            <Row>
              <Col sm={6}>
                <div className="small text-muted">Name</div>
                <div className="fw-semibold">{org.name}</div>
              </Col>
              <Col sm={6}>
                <div className="small text-muted">Slug</div>
                <div className="font-monospace">/{org.slug}</div>
              </Col>
              <Col sm={6} className="mt-3">
                <div className="small text-muted">Members</div>
                <div>{org._count?.members ?? 0}</div>
              </Col>
              <Col sm={6} className="mt-3">
                <div className="small text-muted">Created</div>
                <div>{org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '—'}</div>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      )}

      <Card className="shadow-sm border-0">
        <Card.Header className="bg-transparent border-bottom d-flex justify-content-between align-items-center">
          <span className="fw-semibold">Members</span>
          <Button variant="primary" size="sm" onClick={() => setShowInvite(true)}>
            <i className="bi bi-person-plus me-1"></i>Add Member
          </Button>
        </Card.Header>
        <Card.Body className="p-0">
          {isLoading ? <LoadingSpinner /> : members.length === 0 ? (
            <EmptyState icon="bi-people" title="No members" />
          ) : (
            <Table responsive hover className="mb-0 small">
              <thead className="table-light">
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {members.map((m: Record<string, unknown>) => {
                  const mu = m.user as Record<string, string>;
                  const mr = m.role as Record<string, string>;
                  return (
                    <tr key={m.id as string}>
                      <td className="fw-semibold">{mu.firstName} {mu.lastName}</td>
                      <td>{mu.email}</td>
                      <td><Badge bg="light" text="dark" className="text-capitalize">{mr.name}</Badge></td>
                      <td>{new Date(m.joinedAt as string).toLocaleDateString()}</td>
                      <td>
                        {mu.id !== user?.id && (
                          <Button variant="outline-danger" size="sm"
                            onClick={() => { if (confirm('Remove this member?')) removeMutation.mutate(m.id as string); }}>
                            <i className="bi bi-person-x"></i>
                          </Button>
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

      <Modal show={showInvite} onHide={() => setShowInvite(false)}>
        <Modal.Header closeButton><Modal.Title>Add Member</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmit(d => { inviteMutation.mutate(d); reset(); })}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control type="email" isInvalid={!!errors.email}
                {...register('email', { required: 'Email required' })} />
              <Form.Text className="text-muted">User must already have an account.</Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Role</Form.Label>
              <Form.Select isInvalid={!!errors.roleId} {...register('roleId', { required: 'Role required' })}>
                <option value="">Select role…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Form.Select>
              {roles.length === 0 && <Form.Text className="text-muted">Roles will appear after organization is seeded.</Form.Text>}
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? 'Adding…' : 'Add Member'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
