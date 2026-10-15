import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from './index.js';
import { prisma } from './config/database.js';

describe('Integration Tests: End-to-End Platform Flows', () => {
  const testRunId = Date.now().toString().slice(-6);
  const user1Email = `owner_${testRunId}@platform-test.local`;
  const user2Email = `other_tenant_${testRunId}@platform-test.local`;
  const password = 'StrongPassword123!';

  let user1Token = '';
  let user2Token = '';
  let org1Id = '';
  let org2Id = '';
  let integrationId = '';
  let automationId = '';
  let incidentId = '';

  afterAll(async () => {
    // Clean up test data created during the test run
    if (org1Id) {
      await prisma.auditLog.deleteMany({ where: { organizationId: org1Id } });
      await prisma.executionLog.deleteMany({ where: { execution: { organizationId: org1Id } } });
      await prisma.automationExecution.deleteMany({ where: { organizationId: org1Id } });
      await prisma.automation.deleteMany({ where: { organizationId: org1Id } });
      await prisma.integration.deleteMany({ where: { organizationId: org1Id } });
      await prisma.incident.deleteMany({ where: { organizationId: org1Id } });
      await prisma.securityFinding.deleteMany({ where: { organizationId: org1Id } });
      await prisma.backupPolicy.deleteMany({ where: { organizationId: org1Id } });
      await prisma.document.deleteMany({ where: { organizationId: org1Id } });
      await prisma.performanceReview.deleteMany({ where: { organizationId: org1Id } });
      await prisma.organizationMember.deleteMany({ where: { organizationId: org1Id } });
      await prisma.organization.deleteMany({ where: { id: org1Id } });
    }
    if (org2Id) {
      await prisma.auditLog.deleteMany({ where: { organizationId: org2Id } });
      await prisma.organizationMember.deleteMany({ where: { organizationId: org2Id } });
      await prisma.organization.deleteMany({ where: { id: org2Id } });
    }
    await prisma.session.deleteMany({ where: { user: { email: { in: [user1Email, user2Email] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [user1Email, user2Email] } } });
  });

  describe('Health and System Status', () => {
    it('GET /health returns healthy status with connected database', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.database).toBe('connected');
    });

    it('GET /ready returns ready status', async () => {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });
  });

  describe('Module B: Identity, Authentication & Roles', () => {
    it('registers a new user and denies duplicate registration with 409', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: user1Email,
          password,
          firstName: 'Platform',
          lastName: 'Architect',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(user1Email);

      // Attempt duplicate registration
      const dupRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: user1Email,
          password,
          firstName: 'Duplicate',
          lastName: 'User',
        });

      expect(dupRes.status).toBe(409);
    });

    it('authenticates user and returns JWT access token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user1Email, password });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      user1Token = res.body.data.accessToken;

      // Also register second tenant user
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: user2Email, password, firstName: 'Other', lastName: 'Tenant' });

      const res2 = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user2Email, password });
      user2Token = res2.body.data.accessToken;
    });

    it('rejects invalid credentials with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user1Email, password: 'WrongPassword999!' });

      expect(res.status).toBe(401);
    });

    it('creates an organization and automatically assigns creator as Owner', async () => {
      const res = await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: `Acme Corp ${testRunId}`,
          slug: `acme-corp-${testRunId}`,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.organization.id).toBeDefined();
      org1Id = res.body.data.organization.id;

      // Create org 2 for tenant 2
      const res2 = await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          name: `Beta Corp ${testRunId}`,
          slug: `beta-corp-${testRunId}`,
        });
      org2Id = res2.body.data.organization.id;
    });
  });

  describe('Module A: Integrations & Credential Safety', () => {
    it('creates an integration with encrypted credentials without leaking secrets in response', async () => {
      const res = await request(app)
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Organization-Id', org1Id)
        .send({
          name: 'Primary HTTP Integration',
          provider: 'http',
          config: { baseUrl: 'https://api.example.com' },
          credentials: { apiKey: 'secret-production-token-12345' },
        });

      expect(res.status).toBe(201);
      const integration = res.body.data.integration;
      integrationId = integration.id;
      expect(integration.name).toBe('Primary HTTP Integration');
      expect(integration.provider).toBe('http');
      // Credential secrets must never be leaked back as raw text
      expect(integration.credentials).not.toBe('secret-production-token-12345');
    });

    it('tests connectivity for configured integration', async () => {
      const res = await request(app)
        .post(`/api/v1/integrations/${integrationId}/test`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Organization-Id', org1Id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Module C: Automation Workflows & Lifecycle', () => {
    it('creates an automation workflow', async () => {
      const res = await request(app)
        .post('/api/v1/automations')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Organization-Id', org1Id)
        .send({
          name: `Hourly Sync ${testRunId}`,
          type: 'scheduled',
          schedule: '0 * * * *',
          timezone: 'UTC',
          config: { endpoint: '/sync' },
        });

      expect(res.status).toBe(201);
      automationId = res.body.data.automation.id;
      expect(res.body.data.automation.name).toContain('Hourly Sync');
    });

    it('enqueues a manual run and creates execution record in queued state', async () => {
      const res = await request(app)
        .post(`/api/v1/automations/${automationId}/run`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Organization-Id', org1Id)
        .send({ input: { dryRun: true } });

      expect(res.status).toBe(202);
      expect(res.body.data.execution).toBeDefined();
      expect(res.body.data.execution.status).toBe('queued');
    });
  });

  describe('Module D: Incident Detection & Management', () => {
    it('creates an incident and updates its lifecycle through acknowledge and resolve', async () => {
      const res = await request(app)
        .post('/api/v1/incidents')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Organization-Id', org1Id)
        .send({
          title: 'High Latency Detected in Sync Pipeline',
          description: 'P95 latency exceeded 2000ms threshold for 3 consecutive intervals.',
          severity: 'high',
          source: 'automation',
          sourceId: automationId,
        });

      expect(res.status).toBe(201);
      incidentId = res.body.data.incident.id;
      expect(res.body.data.incident.status).toBe('detected');

      // Acknowledge incident
      const ackRes = await request(app)
        .post(`/api/v1/incidents/${incidentId}/ack`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Organization-Id', org1Id);
      expect(ackRes.status).toBe(200);
      expect(ackRes.body.data.incident.status).toBe('acknowledged');

      // Resolve incident
      const resolveRes = await request(app)
        .post(`/api/v1/incidents/${incidentId}/resolve`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Organization-Id', org1Id)
        .send({ resolution: 'Scaled worker concurrency and recovered healthy latency' });
      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.incident.status).toBe('resolved');
      expect(resolveRes.body.data.incident.resolution).toContain('Scaled worker concurrency');
    });
  });

  describe('Module F: Security Center Findings', () => {
    it('records security findings and calculates severity metrics', async () => {
      const res = await request(app)
        .post('/api/v1/security/findings')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Organization-Id', org1Id)
        .send({
          title: 'MFA Not Enabled for Administrator Account',
          description: 'Privileged user accounts must have multi-factor authentication active.',
          severity: 'high',
          confidence: 'high',
          category: 'authentication',
          remediation: 'Enable MFA in organization security settings.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.finding.severity).toBe('high');

      // Check security stats
      const statsRes = await request(app)
        .get('/api/v1/security/stats')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Organization-Id', org1Id);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.data.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Multi-Tenancy Isolation Negative Tests', () => {
    it('prevents user from Tenant 2 accessing Tenant 1 integrations', async () => {
      const res = await request(app)
        .get(`/api/v1/integrations/${integrationId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .set('X-Organization-Id', org2Id);

      // Must be 404 Not Found or 403 Forbidden - never leak Tenant 1 data!
      expect([403, 404]).toContain(res.status);
    });

    it('prevents user from Tenant 2 running Tenant 1 automations', async () => {
      const res = await request(app)
        .post(`/api/v1/automations/${automationId}/run`)
        .set('Authorization', `Bearer ${user2Token}`)
        .set('X-Organization-Id', org2Id)
        .send({});

      expect([403, 404]).toContain(res.status);
    });
  });

  describe('Audit Trail Verification', () => {
    it('verifies audit logs capture privileged operations', async () => {
      const res = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('X-Organization-Id', org1Id);

      expect(res.status).toBe(200);
      expect(res.body.data.logs).toBeDefined();
      expect(res.body.data.logs.length).toBeGreaterThan(0);

      // Verify that audit logs include actions performed earlier
      const actions = res.body.data.logs.map((l: { action: string }) => l.action);
      expect(actions.some((a: string) => a.startsWith('integration.') || a.startsWith('automation.') || a.startsWith('incident.'))).toBe(true);
    });
  });
});
