import { prisma } from '@/config/database.js';
import { auditService } from '@/services/audit.service.js';
import { NotFoundError } from '@/utils/errors.js';
import type { Prisma } from '@prisma/client';

export class SecurityService {
  async listFindings(organizationId: string, options: {
    severity?: string; status?: string; category?: string;
    limit?: number; offset?: number;
  } = {}) {
    const where: Record<string, unknown> = { organizationId };
    if (options.severity) where.severity = options.severity;
    if (options.status) where.status = options.status;
    if (options.category) where.category = options.category;

    const [findings, total] = await Promise.all([
      prisma.securityFinding.findMany({
        where, orderBy: [{ severity: 'asc' }, { detectedAt: 'desc' }],
        take: options.limit ?? 50, skip: options.offset ?? 0,
      }),
      prisma.securityFinding.count({ where }),
    ]);
    return { findings, total };
  }

  async getFindingById(id: string, organizationId: string) {
    const finding = await prisma.securityFinding.findFirst({ where: { id, organizationId } });
    if (!finding) throw new NotFoundError('Security finding not found');
    return finding;
  }

  async createFinding(data: {
    organizationId: string;
    title: string;
    description: string;
    severity: string;
    confidence: string;
    category: string;
    affectedResource?: string;
    evidence?: Record<string, unknown>;
    impact?: string;
    remediation?: string;
    createdBy?: string;
  }) {
    const finding = await prisma.securityFinding.create({
      data: {
        organizationId: data.organizationId,
        title: data.title,
        description: data.description,
        severity: data.severity,
        confidence: data.confidence,
        category: data.category,
        affectedResource: data.affectedResource,
        evidence: (data.evidence ?? {}) as unknown as Prisma.InputJsonValue,
        impact: data.impact,
        remediation: data.remediation,
        status: 'open',
      },
    });

    if (data.createdBy) {
      await auditService.logSuccess({
        organizationId: data.organizationId, userId: data.createdBy,
        action: 'security_finding.create', resource: 'security_finding', resourceId: finding.id,
        metadata: { severity: data.severity, category: data.category },
      });
    }
    return finding;
  }

  async updateFinding(id: string, organizationId: string, data: {
    status?: string; assignedTo?: string; dueDate?: Date; resolvedBy?: string;
  }, userId: string) {
    await this.getFindingById(id, organizationId);

    const updateData: Record<string, unknown> = { ...data };
    if (data.status === 'resolved') {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = userId;
    }

    const finding = await prisma.securityFinding.update({ where: { id }, data: updateData });
    await auditService.logSuccess({
      organizationId, userId, action: 'security_finding.update',
      resource: 'security_finding', resourceId: id, changes: data as Record<string, unknown>,
    });
    return finding;
  }

  async getStats(organizationId: string) {
    const [total, bySeverity, byStatus, byCategory] = await Promise.all([
      prisma.securityFinding.count({ where: { organizationId } }),
      prisma.securityFinding.groupBy({ by: ['severity'], where: { organizationId }, _count: true }),
      prisma.securityFinding.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
      prisma.securityFinding.groupBy({ by: ['category'], where: { organizationId }, _count: true }),
    ]);

    const openCritical = await prisma.securityFinding.count({
      where: { organizationId, severity: 'critical', status: { not: 'resolved' } },
    });

    return { total, openCritical, bySeverity, byStatus, byCategory };
  }

  async runAssessment(organizationId: string, userId: string) {
    // Collect observable evidence and generate findings
    const findings: Array<Record<string, unknown>> = [];

    // Check for integration credential age
    const integrations = await prisma.integration.findMany({
      where: { organizationId, status: 'active' },
      select: { id: true, name: true, provider: true, updatedAt: true },
    });

    const staleIntegrations = integrations.filter(
      i => Date.now() - i.updatedAt.getTime() > 180 * 86_400_000
    );
    if (staleIntegrations.length > 0) {
      findings.push({
        title: 'Stale integration credentials',
        description: `${staleIntegrations.length} integration(s) have not had credentials rotated in 180+ days`,
        severity: 'medium', confidence: 'high', category: 'credentials',
        affectedResource: staleIntegrations.map(i => i.name).join(', '),
        evidence: { integrationIds: staleIntegrations.map(i => i.id) },
        impact: 'Stale credentials increase exposure window',
        remediation: 'Rotate credentials for all affected integrations',
      });
    }

    // Check for failed integrations
    const failedIntegrations = await prisma.integration.count({ where: { organizationId, status: 'error' } });
    if (failedIntegrations > 0) {
      findings.push({
        title: 'Integration connections in error state',
        description: `${failedIntegrations} integration(s) are in error state`,
        severity: 'high', confidence: 'high', category: 'network',
        affectedResource: `${failedIntegrations} integration(s)`,
        evidence: { count: failedIntegrations },
        impact: 'Integration failures may indicate misconfiguration or revoked access',
        remediation: 'Review and reconnect all failed integrations',
      });
    }

    // Save findings
    const created = await Promise.all(findings.map(f =>
      this.createFinding({
        organizationId,
        title: f.title as string,
        description: f.description as string,
        severity: f.severity as string,
        confidence: f.confidence as string,
        category: f.category as string,
        affectedResource: f.affectedResource as string | undefined,
        evidence: f.evidence as Record<string, unknown> | undefined,
        impact: f.impact as string | undefined,
        remediation: f.remediation as string | undefined,
      })
    ));

    await auditService.logSuccess({
      organizationId, userId,
      action: 'security.assessment', resource: 'security', resourceId: organizationId,
      metadata: { findingsCreated: created.length },
    });

    return { findings: created };
  }
}

export const securityService = new SecurityService();
