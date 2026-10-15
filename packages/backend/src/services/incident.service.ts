import { prisma } from '@/config/database.js';
import { auditService } from '@/services/audit.service.js';
import { NotFoundError, ConflictError } from '@/utils/errors.js';
import type { Prisma } from '@prisma/client';

export interface CreateIncidentData {
  organizationId: string;
  title: string;
  description?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  source: 'automation' | 'integration' | 'manual' | 'system';
  sourceId?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

export interface UpdateIncidentData {
  title?: string;
  description?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  assignedTo?: string;
  metadata?: Record<string, unknown>;
}

export interface IncidentListOptions {
  status?: string;
  severity?: string;
  source?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class IncidentService {
  async list(organizationId: string, options: IncidentListOptions = {}) {
    const where: Record<string, unknown> = { organizationId };
    if (options.status) where.status = options.status;
    if (options.severity) where.severity = options.severity;
    if (options.source) where.source = options.source;
    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) (where.createdAt as Record<string, unknown>).gte = options.startDate;
      if (options.endDate) (where.createdAt as Record<string, unknown>).lte = options.endDate;
    }

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
        take: options.limit ?? 50,
        skip: options.offset ?? 0,
        include: { _count: { select: { notifications: true } } },
      }),
      prisma.incident.count({ where }),
    ]);
    return { incidents, total };
  }

  async getById(id: string, organizationId: string) {
    const incident = await prisma.incident.findFirst({
      where: { id, organizationId },
      include: {
        notifications: {
          include: { channel: { select: { id: true, name: true, type: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!incident) throw new NotFoundError('Incident not found');
    return incident;
  }

  async create(data: CreateIncidentData) {
    const incident = await prisma.incident.create({
      data: {
        organizationId: data.organizationId,
        title: data.title,
        description: data.description,
        severity: data.severity,
        source: data.source,
        sourceId: data.sourceId,
        metadata: (data.metadata ?? {}) as unknown as Prisma.InputJsonValue,
        status: 'detected',
      },
    });

    if (data.createdBy) {
      await auditService.logSuccess({
        organizationId: data.organizationId,
        userId: data.createdBy,
        action: 'incident.create',
        resource: 'incident',
        resourceId: incident.id,
        metadata: { severity: data.severity, source: data.source },
      });
    }

    return incident;
  }

  async acknowledge(id: string, organizationId: string, userId: string) {
    const incident = await prisma.incident.findFirst({ where: { id, organizationId } });
    if (!incident) throw new NotFoundError('Incident not found');
    if (incident.status !== 'detected') throw new ConflictError('Incident is not in detected status');

    const updated = await prisma.incident.update({
      where: { id },
      data: { status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedBy: userId },
    });
    await auditService.logSuccess({ organizationId, userId, action: 'incident.acknowledge', resource: 'incident', resourceId: id });
    return updated;
  }

  async investigate(id: string, organizationId: string, userId: string) {
    const updated = await prisma.incident.update({
      where: { id },
      data: { status: 'investigating' },
    });
    await auditService.logSuccess({ organizationId, userId, action: 'incident.investigate', resource: 'incident', resourceId: id });
    return updated;
  }

  async resolve(id: string, organizationId: string, userId: string, resolution: string) {
    const incident = await prisma.incident.findFirst({ where: { id, organizationId } });
    if (!incident) throw new NotFoundError('Incident not found');
    if (incident.status === 'resolved') throw new ConflictError('Incident is already resolved');

    const updated = await prisma.incident.update({
      where: { id },
      data: { status: 'resolved', resolvedAt: new Date(), resolvedBy: userId, resolution },
    });
    await auditService.logSuccess({ organizationId, userId, action: 'incident.resolve', resource: 'incident', resourceId: id, metadata: { resolution } });
    return updated;
  }

  async update(id: string, organizationId: string, data: UpdateIncidentData, userId: string) {
    await this.getById(id, organizationId);
    const updateData: Prisma.IncidentUpdateInput = {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.severity !== undefined ? { severity: data.severity } : {}),
      ...(data.assignedTo !== undefined ? { assignedTo: data.assignedTo } : {}),
      ...(data.metadata !== undefined ? { metadata: data.metadata as unknown as Prisma.InputJsonValue } : {}),
    };
    const updated = await prisma.incident.update({ where: { id }, data: updateData });
    await auditService.logSuccess({ organizationId, userId, action: 'incident.update', resource: 'incident', resourceId: id, changes: data as Record<string, unknown> });
    return updated;
  }

  async getStats(organizationId: string) {
    const [total, bySeverity, byStatus] = await Promise.all([
      prisma.incident.count({ where: { organizationId } }),
      prisma.incident.groupBy({ by: ['severity'], where: { organizationId }, _count: true }),
      prisma.incident.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
    ]);

    const openCount = await prisma.incident.count({
      where: { organizationId, status: { not: 'resolved' } },
    });

    return { total, openCount, bySeverity, byStatus };
  }

  async createFromAutomationFailure(organizationId: string, automationId: string, executionId: string, error: string) {
    return this.create({
      organizationId,
      title: `Automation failure detected`,
      description: `Execution ${executionId} failed: ${error}`,
      severity: 'high',
      source: 'automation',
      sourceId: executionId,
      metadata: { automationId, executionId },
    });
  }
}

export const incidentService = new IncidentService();
