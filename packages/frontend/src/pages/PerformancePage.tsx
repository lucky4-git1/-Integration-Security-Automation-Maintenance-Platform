import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Table, Modal, Form, Row, Col, Alert } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { performanceApi, getApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function PerformancePage() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedReview, setSelectedReview] = useState<Record<string, unknown> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['performance-reviews', organizationId],
    queryFn: () => performanceApi.reviews(),
    enabled: !!organizationId,
  });

  const { data: reviewDetail } = useQuery({
    queryKey: ['performance-review', selectedReview?.id],
    queryFn: () => performanceApi.getReview(selectedReview!.id as string),
    enabled: !!selectedReview,
  });

  const createMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => performanceApi.createReview(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['performance-reviews'] }); setShowCreate(false); toast.success('Review created with live metrics'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => performanceApi.approveReview(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['performance-reviews'] }); toast.success('Review approved'); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    title: string; startDate: string; endDate: string; description: string;
  }>();

  const reviews = data?.data?.reviews ?? [];
  const detail = reviewDetail?.data?.review;

  const onSubmit = (d: Record<string, string>) => {
    createMutation.mutate({ ...d, startDate: new Date(d.startDate).toISOString(), endDate: new Date(d.endDate).toISOString() });
    reset();
  };

  const renderMetric = (label: string, value: unknown) => (
    <div className="mb-2">
      <span className="text-muted small">{label}: </span>
      <strong>{value === 'no_data' || value === null || value === undefined ? <span className="text-muted fst-italic">No data available</span> : String(value)}</strong>
    </div>
  );

  return (
    <>
      <PageHeader title="Performance Reviews" subtitle="Evidence-based operational metrics and improvements"
        action={<Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><i className="bi bi-plus-lg me-1"></i>New Review</Button>} />

      <Row className="g-3">
        <Col lg={selectedReview ? 5 : 12}>
          <Card className="shadow-sm border-0">
            <Card.Body className="p-0">
              {isLoading ? <LoadingSpinner /> : reviews.length === 0 ? (
                <EmptyState icon="bi-graph-up" title="No reviews yet"
                  description="Create a performance review to collect metrics from recorded telemetry."
                  action={<Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>Create Review</Button>} />
              ) : (
                <Table responsive hover className="mb-0 small">
                  <thead className="table-light">
                    <tr><th>Title</th><th>Period</th><th>Status</th><th>Recommendations</th><th></th></tr>
                  </thead>
                  <tbody>
                    {reviews.map((r: Record<string, unknown>) => (
                      <tr key={r.id as string} className={selectedReview?.id === r.id ? 'table-active' : ''}>
                        <td className="fw-semibold">{r.title as string}</td>
                        <td>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                            {new Date(r.startDate as string).toLocaleDateString()} – {new Date(r.endDate as string).toLocaleDateString()}
                          </div>
                        </td>
                        <td><StatusBadge status={r.status as string} /></td>
                        <td>{(r._count as Record<string, number>)?.recommendations ?? 0}</td>
                        <td>
                          <Button variant="outline-secondary" size="sm" onClick={() => setSelectedReview(r)}>View</Button>
                          {r.status !== 'approved' && (
                            <Button variant="outline-success" size="sm" className="ms-1" onClick={() => approveMutation.mutate(r.id as string)}>Approve</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>

        {selectedReview && detail && (
          <Col lg={7}>
            <Card className="shadow-sm border-0">
              <Card.Header className="bg-transparent border-bottom d-flex justify-content-between">
                <span className="fw-semibold">{detail.title}</span>
                <Button variant="link" size="sm" className="p-0 text-muted" onClick={() => setSelectedReview(null)}>✕</Button>
              </Card.Header>
              <Card.Body>
                {detail.metrics && (() => {
                  const m = (detail.metrics ?? {}) as any;
                  return (
                    <>
                      <h6 className="mb-3">Collected Metrics <span className="badge bg-light text-muted ms-1 small">from recorded telemetry</span></h6>
                      <Row className="g-3 mb-3">
                        <Col sm={6}>
                          <Card className="border bg-light">
                            <Card.Body className="py-2">
                              <div className="small fw-semibold mb-1">Automations</div>
                              {renderMetric('Total Executions', m.automations?.totalExecutions)}
                              {renderMetric('Success Rate', m.automations?.successRate !== 'no_data' ? `${m.automations?.successRate}%` : 'no_data')}
                              {renderMetric('Avg Duration', m.automations?.avgDurationMs ? `${m.automations?.avgDurationMs}ms` : 'no_data')}
                            </Card.Body>
                          </Card>
                        </Col>
                        <Col sm={6}>
                          <Card className="border bg-light">
                            <Card.Body className="py-2">
                              <div className="small fw-semibold mb-1">Incidents</div>
                              {renderMetric('Total', m.incidents?.total)}
                              {renderMetric('Resolved', m.incidents?.resolved)}
                              {renderMetric('Resolution Rate', m.incidents?.resolutionRate !== 'no_data' ? `${m.incidents?.resolutionRate}%` : 'no_data')}
                            </Card.Body>
                          </Card>
                        </Col>
                        <Col sm={6}>
                          <Card className="border bg-light">
                            <Card.Body className="py-2">
                              <div className="small fw-semibold mb-1">Backups</div>
                              {renderMetric('Total', m.backups?.total)}
                              {renderMetric('Success Rate', m.backups?.successRate !== 'no_data' ? `${m.backups?.successRate}%` : 'no_data')}
                            </Card.Body>
                          </Card>
                        </Col>
                        <Col sm={6}>
                          <Card className="border bg-light">
                            <Card.Body className="py-2">
                              <div className="small fw-semibold mb-1">Security</div>
                              {renderMetric('Open Findings', m.security?.openFindings)}
                            </Card.Body>
                          </Card>
                        </Col>
                      </Row>
                      <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                        Data collected at: {String(m.collectedAt ?? '')} · Source: {String(m.dataSource ?? '')}
                      </div>
                    </>
                  );
                })()}

                {detail.recommendations?.length > 0 && (
                  <>
                    <hr />
                    <h6>Recommendations</h6>
                    {detail.recommendations.map((rec: Record<string, unknown>) => (
                      <Alert key={rec.id as string} variant={rec.priority === 'critical' ? 'danger' : rec.priority === 'high' ? 'warning' : 'light'} className="small py-2">
                        <strong>{rec.title as string}</strong>
                        <div>{rec.description as string}</div>
                        <StatusBadge status={rec.status as string} />
                      </Alert>
                    ))}
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>
        )}
      </Row>

      <Modal show={showCreate} onHide={() => setShowCreate(false)}>
        <Modal.Header closeButton><Modal.Title>New Performance Review</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmit(onSubmit)}>
          <Modal.Body>
            <Alert variant="info" className="small">Metrics are collected automatically from recorded telemetry for the selected period.</Alert>
            <Form.Group className="mb-3">
              <Form.Label>Title</Form.Label>
              <Form.Control isInvalid={!!errors.title} {...register('title', { required: 'Required' })} placeholder="e.g. Q4 2026 Operations Review" />
            </Form.Group>
            <Row>
              <Col>
                <Form.Group className="mb-3">
                  <Form.Label>Start Date</Form.Label>
                  <Form.Control type="date" isInvalid={!!errors.startDate} {...register('startDate', { required: 'Required' })} />
                </Form.Group>
              </Col>
              <Col>
                <Form.Group className="mb-3">
                  <Form.Label>End Date</Form.Label>
                  <Form.Control type="date" isInvalid={!!errors.endDate} {...register('endDate', { required: 'Required' })} />
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control as="textarea" rows={2} {...register('description')} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create & Collect Metrics'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
