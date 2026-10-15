import { prisma } from '@/config/database.js';
import { type AuditLog, Prisma } from '@prisma/client';

export interface AuditLogData {
  organizationId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  result: 'success' | 'failure' | 'denied';
}

export class AuditService {
  /**
   * Create audit log entry
   */
  async log(data: AuditLogData): Promise<AuditLog> {
    return prisma.auditLog.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId,
        changes: data.changes ? (data.changes as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        metadata: (data.metadata || {}) as unknown as Prisma.InputJsonValue,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        result: data.result,
      },
    });
  }

  /**
   * Log successful action
   */
  async logSuccess(data: Omit<AuditLogData, 'result'>): Promise<AuditLog> {
    return this.log({ ...data, result: 'success' });
  }

  /**
   * Log failed action
   */
  async logFailure(data: Omit<AuditLogData, 'result'>): Promise<AuditLog> {
    return this.log({ ...data, result: 'failure' });
  }

  /**
   * Log denied action (authorization failure)
   */
  async logDenied(data: Omit<AuditLogData, 'result'>): Promise<AuditLog> {
    return this.log({ ...data, result: 'denied' });
  }

  /**
   * Get audit logs for organization
   */
  async getOrganizationLogs(
    organizationId: string,
    options: {
      userId?: string;
      action?: string;
      resource?: string;
      result?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {
      organizationId,
    };

    if (options.userId) {
      where.userId = options.userId;
    }

    if (options.action) {
      where.action = options.action;
    }

    if (options.resource) {
      where.resource = options.resource;
    }

    if (options.result) {
      where.result = options.result;
    }

    if (options.startDate || options.endDate) {
      where.timestamp = {};
      if (options.startDate) {
        (where.timestamp as Prisma.DateTimeFilter).gte = options.startDate;
      }
      if (options.endDate) {
        (where.timestamp as Prisma.DateTimeFilter).lte = options.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * Get user activity logs
   */
  async getUserActivity(
    userId: string,
    options: {
      organizationId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {
      userId,
    };

    if (options.organizationId) {
      where.organizationId = options.organizationId;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * Get resource history
   */
  async getResourceHistory(
    organizationId: string,
    resource: string,
    resourceId: string,
    options: {
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      resource,
      resourceId,
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * Clean up old audit logs based on retention policy
   */
  async cleanupOldLogs(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.auditLog.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }
}

export const auditService = new AuditService();
