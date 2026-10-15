import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Table, Modal, Form, Row, Col, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { securityApi, getApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { SeverityBadge, StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function SecurityPage() {
  const { organizationId } = useAuth();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [selectedFinding, setSelectedFinding] = useState<Record<string, unknown> | null>(null);
  const [scanning, setScanning] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['security-findings', organizationId, statusFilter, severityFilter],
    queryFn: () => securityApi.findings({ status: statusFilter || undefined, severity: severityFilter || undefined, limit: 100 }),
    enabled: !!organizationId,
  });

  const { data: statsData } = useQuery({
    queryKey: ['security-stats', organizationId],
    queryFn: () => securityApi.stats(),
    enabled: !!organizationId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => securityApi.updateFinding(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['security-findings'] }); qc.invalidateQueries({ queryKey: ['security-stats'] }); toast.success('Finding updated'); setSelectedFinding(null); },
    onError: (err) => toast.error(getApiError(err)),
  });

  const handleAssessment = async () => {
    setScanning(true);
    try {
      const r = await securityApi.runAssessment();
      qc.invalidateQueries({ queryKey: ['security-findings'] });
      qc.invalidateQueries({ queryKey: ['security-stats'] });
      toast.success(`Assessment complete — ${r.data.findings?.length ?? 0} finding(s) recorded`);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setScanning(false);
    }
  };

  const stats = statsData?.data ?? {};
  const findings = data?.data?.findings ?? [];

  return (
    <>
      <PageHeader title="Security Center" subtitle="Evidence-based security findings and recommendations"
        action={
          <Button variant="warning" size="sm" onClick={handleAssessment} disabled={scanning}>
            {scanning ? <><span className="spinner-border spinner-border-sm me-1" />Scanning…</> : <><i className="bi bi-shield-check me-1"></i>Run Assessment</>}
          </Button>
        } />

      <Row className="g-2 mb-4">
        {['critical', 'high', 'medium', 'low'].map(sev => {
          const count = stats.bySeverity?.find((x: { severity: string; _count: number }) => x.severity === sev)?._count ?? 0;
          return (
            <Col key={sev} xs={6} md={3}>
              <Card className={`border-0 shadow-sm text-center py-2 cursor-pointer ${severityFilter === sev ? 'border border-primary' : ''}`}
                onClick={() => setSeverityFilter(sev === severityFilter ? '' : sev)} style={{ cursor: 'pointer' }}>
                <div className={`fs-4 fw-bold text-${sev === 'critical' ? 'danger' : sev === 'high' ? 'warning' : sev === 'medium' ? 'info' : 'secondary'}`}>{count}</div>
                <div className="small text-muted text-capitalize">{sev}</div>
              </Card>
            </Col>
          );
        })}
      </Row>

      <div className="mb-3 d-flex gap-2 flex-wrap">
        {['', 'open', 'inProgress', 'resolved', 'accepted', 'falsePositive'].map(s => (
          <Button key={s} size="sm"
            variant={statusFilter === s ? 'primary' : 'outline-secondary'}
            onClick={() => setStatusFilter(s)}>
            {s || 'All'}
          </Button>
        ))}
      </div>

      <Card className="shadow-sm border-0">
        <Card.Body className="p-0">
          {isLoading ? <LoadingSpinner /> : findings.length === 0 ? (
            <EmptyState icon="bi-shield-check" title="No findings"
              description="Run an assessment to identify security issues."
              action={<Button variant="warning" size="sm" onClick={handleAssessment}>Run Assessment</Button>} />
          ) : (
            <Table responsive hover className="mb-0 small">
              <thead className="table-light">
                <tr><th>Title</th><th>Severity</th><th>Category</th><th>Status</th><th>Detected</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {findings.map((f: Record<string, unknown>) => (
                  <tr key={f.id as string}>
                    <td>
                      <div className="fw-semibold">{f.title as string}</div>
                      {Boolean(f.affectedResource) && <div className="text-muted" style={{ fontSize: '0.75rem' }}>{String(f.affectedResource)}</div>}
                    </td>
                    <td><SeverityBadge severity={f.severity as string} /></td>
                    <td className="text-capitalize">{(f.category as string).replace('_', ' ')}</td>
                    <td><StatusBadge status={f.status as string} /></td>
                    <td>{new Date(f.detectedAt as string).toLocaleDateString()}</td>
                    <td>
                      <Button variant="outline-secondary" size="sm" onClick={() => setSelectedFinding(f)}>View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Finding Detail Modal */}
      <Modal show={!!selectedFinding} onHide={() => setSelectedFinding(null)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{selectedFinding?.title as string}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedFinding && (
            <>
              <div className="d-flex gap-2 mb-3">
                <SeverityBadge severity={selectedFinding.severity as string} />
                <StatusBadge status={selectedFinding.status as string} />
              </div>
              <p><strong>Description:</strong> {selectedFinding.description as string}</p>
              {selectedFinding.affectedResource && <p><strong>Affected Resource:</strong> {selectedFinding.affectedResource as string}</p>}
              {selectedFinding.impact && <p><strong>Impact:</strong> {selectedFinding.impact as string}</p>}
              {selectedFinding.remediation && (
                <Alert variant="info"><strong>Recommended Remediation:</strong><br />{selectedFinding.remediation as string}</Alert>
              )}
              <Form.Group>
                <Form.Label>Update Status</Form.Label>
                <Form.Select defaultValue={selectedFinding.status as string}
                  onChange={e => updateMutation.mutate({ id: selectedFinding.id as string, data: { status: e.target.value } })}>
                  {['open', 'inProgress', 'resolved', 'accepted', 'falsePositive'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setSelectedFinding(null)}>Close</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
