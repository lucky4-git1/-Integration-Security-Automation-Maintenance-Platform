import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Alert, Badge } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { integrationApi, automationApi, incidentApi, backupApi, securityApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SeverityBadge } from '@/components/ui/StatusBadge';

function StatCard({ title, value, icon, variant = 'primary', to }: {
  title: string; value: string | number; icon: string; variant?: string; to?: string;
}) {
  const content = (
    <Card className={`border-0 border-start border-4 border-${variant} shadow-sm h-100`}>
      <Card.Body className="d-flex align-items-center gap-3">
        <div className={`bg-${variant} bg-opacity-10 rounded p-2`}>
          <i className={`bi ${icon} fs-4 text-${variant}`}></i>
        </div>
        <div>
          <div className="small text-muted">{title}</div>
          <div className="fs-4 fw-bold">{value}</div>
        </div>
      </Card.Body>
    </Card>
  );
  return to ? <Link to={to} className="text-decoration-none">{content}</Link> : content;
}

export function DashboardPage() {
  const { organizationId } = useAuth();

  const { data: integStats, isLoading: loadingInteg } = useQuery({
    queryKey: ['integration-stats', organizationId],
    queryFn: () => integrationApi.stats(),
    enabled: !!organizationId,
  });

  const { data: autoStats, isLoading: loadingAuto } = useQuery({
    queryKey: ['automation-stats', organizationId],
    queryFn: () => automationApi.stats(),
    enabled: !!organizationId,
  });

  const { data: incStats, isLoading: loadingInc } = useQuery({
    queryKey: ['incident-stats', organizationId],
    queryFn: () => incidentApi.stats(),
    enabled: !!organizationId,
  });

  const { data: backupStats, isLoading: loadingBackup } = useQuery({
    queryKey: ['backup-stats', organizationId],
    queryFn: () => backupApi.stats(),
    enabled: !!organizationId,
  });

  const { data: secStats, isLoading: loadingSec } = useQuery({
    queryKey: ['security-stats', organizationId],
    queryFn: () => securityApi.stats(),
    enabled: !!organizationId,
  });

  const { data: recentIncidents } = useQuery({
    queryKey: ['recent-incidents', organizationId],
    queryFn: () => incidentApi.list({ limit: 5, status: 'detected' }),
    enabled: !!organizationId,
  });

  const isLoading = loadingInteg || loadingAuto || loadingInc || loadingBackup || loadingSec;

  if (!organizationId) {
    return (
      <Alert variant="info">
        <i className="bi bi-info-circle me-2"></i>
        No organization selected. <Link to="/organizations">Select or create one</Link> to get started.
      </Alert>
    );
  }

  if (isLoading) return <LoadingSpinner label="Loading dashboard…" />;

  const i = integStats?.data ?? {};
  const a = autoStats?.data ?? {};
  const inc = incStats?.data ?? {};
  const b = backupStats?.data ?? {};
  const s = secStats?.data ?? {};

  const activeIntegrations = i.byStatus?.find((x: { status: string }) => x.status === 'active')?._count ?? 0;
  const errorIntegrations = i.byStatus?.find((x: { status: string }) => x.status === 'error')?._count ?? 0;
  const runningAutomations = a.byStatus?.find((x: { status: string }) => x.status === 'running')?._count ?? 0;
  const failedExecutions = a.byStatus?.find((x: { status: string }) => x.status === 'failed')?._count ?? 0;

  return (
    <>
      <div className="mb-4">
        <h4 className="fw-bold mb-0">Operations Overview</h4>
        <p className="text-muted small mt-1">Live status of your platform</p>
      </div>

      {(errorIntegrations > 0 || inc.openCount > 0 || s.openCritical > 0) && (
        <Alert variant="warning" className="mb-4">
          <i className="bi bi-exclamation-triangle me-2"></i>
          Attention required:
          {errorIntegrations > 0 && <> <strong>{errorIntegrations}</strong> integration(s) in error,</>}
          {inc.openCount > 0 && <> <strong>{inc.openCount}</strong> open incident(s),</>}
          {s.openCritical > 0 && <> <strong>{s.openCritical}</strong> critical security finding(s).</>}
        </Alert>
      )}

      <Row className="g-3 mb-4">
        <Col xs={6} lg={3}>
          <StatCard title="Active Integrations" value={activeIntegrations} icon="bi-plug-fill" variant="success" to="/integrations" />
        </Col>
        <Col xs={6} lg={3}>
          <StatCard title="Running Automations" value={runningAutomations} icon="bi-gear-wide-connected" variant="primary" to="/executions" />
        </Col>
        <Col xs={6} lg={3}>
          <StatCard title="Open Incidents" value={inc.openCount ?? 0} icon="bi-exclamation-triangle-fill" variant={inc.openCount > 0 ? 'danger' : 'success'} to="/incidents" />
        </Col>
        <Col xs={6} lg={3}>
          <StatCard title="Security Findings" value={s.total ?? 0} icon="bi-shield-exclamation" variant={s.openCritical > 0 ? 'danger' : 'warning'} to="/security" />
        </Col>
        <Col xs={6} lg={3}>
          <StatCard title="Backup Policies" value={b.totalPolicies ?? 0} icon="bi-cloud-upload-fill" variant="info" to="/backups" />
        </Col>
        <Col xs={6} lg={3}>
          <StatCard title="Failed Executions" value={failedExecutions} icon="bi-x-circle-fill" variant={failedExecutions > 0 ? 'danger' : 'secondary'} to="/executions?status=failed" />
        </Col>
        <Col xs={6} lg={3}>
          <StatCard title="Recent Backups (24h)" value={b.recentBackups ?? 0} icon="bi-check-circle-fill" variant="success" to="/backups" />
        </Col>
        <Col xs={6} lg={3}>
          <StatCard title="Total Integrations" value={i.total ?? 0} icon="bi-diagram-3-fill" variant="secondary" to="/integrations" />
        </Col>
      </Row>

      <Row className="g-3">
        <Col lg={6}>
          <Card className="shadow-sm border-0 h-100">
            <Card.Header className="bg-transparent border-bottom d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Recent Incidents</span>
              <Link to="/incidents" className="small">View all</Link>
            </Card.Header>
            <Card.Body className="p-0">
              {(recentIncidents?.data?.incidents ?? []).length === 0 ? (
                <div className="text-center py-4 text-muted small">
                  <i className="bi bi-check-circle-fill text-success fs-4 d-block mb-2"></i>
                  No open incidents
                </div>
              ) : (
                <ul className="list-group list-group-flush">
                  {(recentIncidents?.data?.incidents ?? []).map((inc: Record<string, unknown>) => (
                    <li key={inc.id as string} className="list-group-item d-flex justify-content-between align-items-start py-3">
                      <div>
                        <Link to={`/incidents/${inc.id}`} className="fw-semibold text-decoration-none">
                          {inc.title as string}
                        </Link>
                        <div className="small text-muted mt-1">
                          {new Date(inc.createdAt as string).toLocaleString()}
                        </div>
                      </div>
                      <SeverityBadge severity={inc.severity as string} />
                    </li>
                  ))}
                </ul>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={6}>
          <Card className="shadow-sm border-0 h-100">
            <Card.Header className="bg-transparent border-bottom d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Integration Health</span>
              <Link to="/integrations" className="small">Manage</Link>
            </Card.Header>
            <Card.Body>
              {i.byStatus?.length > 0 ? (
                <div className="d-flex flex-column gap-2">
                  {(i.byStatus as Array<{ status: string; _count: number }>).map((s) => (
                    <div key={s.status} className="d-flex justify-content-between align-items-center">
                      <span className="text-capitalize">{s.status}</span>
                      <div className="d-flex align-items-center gap-2">
                        <div className="bg-light rounded-pill" style={{ width: 100, height: 8 }}>
                          <div
                            className={`rounded-pill h-100 bg-${s.status === 'active' ? 'success' : s.status === 'error' ? 'danger' : 'secondary'}`}
                            style={{ width: `${Math.round((s._count / (i.total || 1)) * 100)}%` }}
                          />
                        </div>
                        <Badge bg={s.status === 'active' ? 'success' : s.status === 'error' ? 'danger' : 'secondary'}>
                          {s._count}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-3 text-muted small">
                  No integrations configured yet.
                  <Link to="/integrations" className="d-block mt-2">Add your first integration</Link>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
