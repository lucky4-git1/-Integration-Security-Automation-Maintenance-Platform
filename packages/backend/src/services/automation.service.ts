import { prisma } from '@/config/database.js';
import { auditService } from '@/services/audit.service.js';
import { NotFoundError, ConflictError } from '@/utils/errors.js';
import { logger } from '@/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { Prisma } from '@prisma/client';

export interface CreateAutomationData {
  organizationId: string;
  name: string;
  description?: string;
  type: 'scheduled' | 'webhook' | 'manual' | 'api';
  schedule?: string;
  timezone?: string;
  config: Record<string, unknown>;
  retryPolicy?: Record<string, unknown>;
  concurrency?: number;
  timeout?: number;
  createdBy: string;
}

export interface UpdateAutomationData {
  name?: string;
  description?: string;
  schedule?: string;
  timezone?: string;
  config?: Record<string, unknown>;
  retryPolicy?: Record<string, unknown>;
  concurrency?: number;
  timeout?: number;
  enabled?: boolean;
}

export interface ListOptions {
  type?: string;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

export interface ExecutionListOptions {
  status?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class AutomationService {
  async list(organizationId: string, options: ListOptions = {}) {
    const where: Record<string, unknown> = { organizationId };
    if (options.type) where.type = options.type;
    if (options.enabled !== undefined) where.enabled = options.enabled;

    const [automations, total] = await Promise.all([
      prisma.automation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit ?? 50,
        skip: options.offset ?? 0,
        include: {
          _count: { select: { executions: true } },
        },
      }),
      prisma.automation.count({ where }),
    ]);

    return { automations, total };
  }

  async getById(id: string, organizationId: string) {
    const automation = await prisma.automation.findFirst({
      where: { id, organizationId },
      include: {
        _count: { select: { executions: true } },
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true, status: true, trigger: true,
            startedAt: true, completedAt: true, duration: true,
            attempt: true, error: true, createdAt: true,
          },
        },
      },
    });
    if (!automation) throw new NotFoundError('Automation not found');
    return automation;
  }

  async create(data: CreateAutomationData) {
    const existing = await prisma.automation.findFirst({
      where: { organizationId: data.organizationId, name: data.name },
    });
    if (existing) throw new ConflictError('Automation name already exists in this organization');

    const automation = await prisma.automation.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        description: data.description,
        type: data.type,
        schedule: data.schedule,
        timezone: data.timezone ?? 'UTC',
        config: data.config as unknown as Prisma.InputJsonValue,
        retryPolicy: (data.retryPolicy ?? { maxAttempts: 3, backoffMs: 1000, maxBackoffMs: 30000 }) as unknown as Prisma.InputJsonValue,
        concurrency: data.concurrency ?? 1,
        timeout: data.timeout ?? 300000,
        createdBy: data.createdBy,
      },
    });

    await auditService.logSuccess({
      organizationId: data.organizationId,
      userId: data.createdBy,
      action: 'automation.create',
      resource: 'automation',
      resourceId: automation.id,
      metadata: { type: data.type, schedule: data.schedule },
    });

    return automation;
  }

  async update(id: string, organizationId: string, data: UpdateAutomationData, userId: string) {
    await this.getById(id, organizationId);

    const updateData: Prisma.AutomationUpdateInput = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.schedule !== undefined ? { schedule: data.schedule } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      ...(data.concurrency !== undefined ? { concurrency: data.concurrency } : {}),
      ...(data.timeout !== undefined ? { timeout: data.timeout } : {}),
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.config !== undefined ? { config: data.config as unknown as Prisma.InputJsonValue } : {}),
      ...(data.retryPolicy !== undefined ? { retryPolicy: data.retryPolicy as unknown as Prisma.InputJsonValue } : {}),
    };

    const automation = await prisma.automation.update({
      where: { id },
      data: updateData,
    });

    await auditService.logSuccess({
      organizationId,
      userId,
      action: 'automation.update',
      resource: 'automation',
      resourceId: id,
      changes: data as Record<string, unknown>,
    });

    return automation;
  }

  async delete(id: string, organizationId: string, userId: string) {
    await this.getById(id, organizationId);
    await prisma.automation.delete({ where: { id } });
    await auditService.logSuccess({
      organizationId, userId,
      action: 'automation.delete', resource: 'automation', resourceId: id,
    });
  }

  async toggleEnabled(id: string, organizationId: string, userId: string) {
    const automation = await this.getById(id, organizationId);
    const updated = await prisma.automation.update({
      where: { id },
      data: { enabled: !automation.enabled },
    });
    await auditService.logSuccess({
      organizationId, userId,
      action: updated.enabled ? 'automation.enable' : 'automation.disable',
      resource: 'automation', resourceId: id,
    });
    return updated;
  }

  async createExecution(data: {
    automationId: string;
    organizationId: string;
    integrationId?: string;
    trigger: string;
    input?: Record<string, unknown>;
    createdBy?: string;
    traceId?: string;
    maxAttempts?: number;
  }) {
    return prisma.automationExecution.create({
      data: {
        automationId: data.automationId,
        organizationId: data.organizationId,
        integrationId: data.integrationId,
        trigger: data.trigger,
        input: (data.input ?? {}) as unknown as Prisma.InputJsonValue,
        createdBy: data.createdBy,
        traceId: data.traceId,
        maxAttempts: data.maxAttempts ?? 3,
        status: 'queued',
      },
    });
  }

  async listExecutions(organizationId: string, automationId: string | undefined, options: ExecutionListOptions = {}) {
    const where: Prisma.AutomationExecutionWhereInput = { organizationId };
    if (automationId) where.automationId = automationId;
    if (options.status) where.status = options.status;
    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) (where.createdAt as Prisma.DateTimeFilter).gte = options.startDate;
      if (options.endDate) (where.createdAt as Prisma.DateTimeFilter).lte = options.endDate;
    }

    const [executions, total] = await Promise.all([
      prisma.automationExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit ?? 50,
        skip: options.offset ?? 0,
        include: {
          automation: { select: { id: true, name: true, type: true } },
        },
      }),
      prisma.automationExecution.count({ where }),
    ]);

    return { executions, total };
  }

  async getExecution(id: string, organizationId: string) {
    const execution = await prisma.automationExecution.findFirst({
      where: { id, organizationId },
      include: {
        automation: true,
        logs: {
          orderBy: { timestamp: 'asc' },
          take: 500,
        },
      },
    });
    if (!execution) throw new NotFoundError('Execution not found');
    return execution;
  }

  async updateExecutionStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
    return prisma.automationExecution.update({
      where: { id },
      data: {
        status,
        ...extra as any,
        ...(status === 'running' ? { startedAt: new Date() } : {}),
        ...((['succeeded', 'failed', 'timeout', 'cancelled'].includes(status)) ? {
          completedAt: new Date(),
        } : {}),
      },
    });
  }

  async appendExecutionLog(executionId: string, level: 'debug' | 'info' | 'warn' | 'error', message: string, metadata: Record<string, unknown> = {}) {
    return prisma.executionLog.create({
      data: { executionId, level, message, metadata: metadata as unknown as Prisma.InputJsonValue },
    });
  }

  async cancelExecution(id: string, organizationId: string, userId: string) {
    const execution = await prisma.automationExecution.findFirst({ where: { id, organizationId } });
    if (!execution) throw new NotFoundError('Execution not found');
    if (!['queued', 'running'].includes(execution.status)) {
      throw new ConflictError(`Cannot cancel execution in status: ${execution.status}`);
    }

    await this.updateExecutionStatus(id, 'cancelled');
    await auditService.logSuccess({
      organizationId, userId,
      action: 'execution.cancel', resource: 'automation_execution', resourceId: id,
    });
  }

  async getExecutionStats(organizationId: string, startDate?: Date, endDate?: Date) {
    const where: Record<string, unknown> = { organizationId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, unknown>).gte = startDate;
      if (endDate) (where.createdAt as Record<string, unknown>).lte = endDate;
    }

    const [byStatus, total] = await Promise.all([
      prisma.automationExecution.groupBy({
        by: ['status'],
        where,
        _count: true,
        _avg: { duration: true },
      }),
      prisma.automationExecution.count({ where }),
    ]);

    return { byStatus, total };
  }

  async enqueueManualRun(automationId: string, organizationId: string, userId: string, input?: Record<string, unknown>) {
    const automation = await this.getById(automationId, organizationId);
    if (!automation.enabled) throw new ConflictError('Automation is disabled');

    const execution = await this.createExecution({      automationId,
      organizationId,
      trigger: 'manual',
      input,
      createdBy: userId,
      traceId: uuidv4(),
      maxAttempts: 1,
    });

    await auditService.logSuccess({
      organizationId, userId,
      action: 'automation.manual_run',
      resource: 'automation', resourceId: automationId,
      metadata: { executionId: execution.id },
    });

    logger.info('Manual automation run queued', { automationId, executionId: execution.id, userId });
    return execution;
  }
}

export const automationService = new AutomationService();
