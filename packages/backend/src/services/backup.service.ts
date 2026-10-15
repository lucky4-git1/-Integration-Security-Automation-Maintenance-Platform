import { prisma } from '@/config/database.js';
import { auditService } from '@/services/audit.service.js';
import { NotFoundError, ConflictError } from '@/utils/errors.js';
import { logger } from '@/utils/logger.js';
import type { Prisma } from '@prisma/client';

export class BackupService {
  async listPolicies(organizationId: string, limit = 50, offset = 0) {
    const [policies, total] = await Promise.all([
      prisma.backupPolicy.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: limit, skip: offset,
        include: { _count: { select: { backups: true } } },
      }),
      prisma.backupPolicy.count({ where: { organizationId } }),
    ]);
    return { policies, total };
  }

  async getPolicyById(id: string, organizationId: string) {
    const policy = await prisma.backupPolicy.findFirst({
      where: { id, organizationId },
      include: {
        backups: { orderBy: { createdAt: 'desc' }, take: 10 },
        _count: { select: { backups: true } },
      },
    });
    if (!policy) throw new NotFoundError('Backup policy not found');
    return policy;
  }

  async createPolicy(data: {
    organizationId: string;
    name: string;
    description?: string;
    schedule: string;
    retentionDays?: number;
    targetType: string;
    targetConfig?: Record<string, unknown>;
    storageType: string;
    storageConfig?: Record<string, unknown>;
    encryption?: boolean;
    verification?: boolean;
    createdBy: string;
  }) {
    const policy = await prisma.backupPolicy.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        description: data.description,
        schedule: data.schedule,
        retentionDays: data.retentionDays ?? 30,
        targetType: data.targetType,
        targetConfig: (data.targetConfig ?? {}) as unknown as Prisma.InputJsonValue,
        storageType: data.storageType,
        storageConfig: (data.storageConfig ?? {}) as unknown as Prisma.InputJsonValue,
        encryption: data.encryption ?? true,
        verification: data.verification ?? true,
        enabled: true,
      },
    });

    await auditService.logSuccess({
      organizationId: data.organizationId,
      userId: data.createdBy,
      action: 'backup_policy.create',
      resource: 'backup_policy',
      resourceId: policy.id,
    });

    return policy;
  }

  async updatePolicy(id: string, organizationId: string, data: Record<string, unknown>, userId: string) {
    await this.getPolicyById(id, organizationId);
    const policy = await prisma.backupPolicy.update({ where: { id }, data });
    await auditService.logSuccess({ organizationId, userId, action: 'backup_policy.update', resource: 'backup_policy', resourceId: id, changes: data });
    return policy;
  }

  async deletePolicy(id: string, organizationId: string, userId: string) {
    await this.getPolicyById(id, organizationId);
    await prisma.backupPolicy.delete({ where: { id } });
    await auditService.logSuccess({ organizationId, userId, action: 'backup_policy.delete', resource: 'backup_policy', resourceId: id });
  }

  async listBackups(organizationId: string, policyId?: string, limit = 50, offset = 0) {
    const where: Record<string, unknown> = {};
    if (policyId) {
      // Verify policy ownership
      const policy = await prisma.backupPolicy.findFirst({ where: { id: policyId, organizationId } });
      if (!policy) throw new NotFoundError('Backup policy not found');
      where.policyId = policyId;
    } else {
      where.policy = { organizationId };
    }

    const [backups, total] = await Promise.all([
      prisma.backup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit, skip: offset,
        include: { policy: { select: { id: true, name: true, organizationId: true } } },
      }),
      prisma.backup.count({ where }),
    ]);
    return { backups, total };
  }

  async getBackupById(id: string, organizationId: string) {
    const backup = await prisma.backup.findFirst({
      where: { id, policy: { organizationId } },
      include: { policy: true, restores: { orderBy: { createdAt: 'desc' } } },
    });
    if (!backup) throw new NotFoundError('Backup not found');
    return backup;
  }

  async triggerManualBackup(policyId: string, organizationId: string, userId: string) {
    const policy = await this.getPolicyById(policyId, organizationId);
    if (!policy.enabled) throw new ConflictError('Backup policy is disabled');

    logger.info('Manual backup triggered', { policyId, userId });

    const backup = await prisma.backup.create({
      data: {
        policyId,
        name: `manual-${Date.now()}`,
        size: BigInt(0),
        checksum: '',
        storageLocation: 'pending',
        status: 'pending',
      },
    });

    await auditService.logSuccess({ organizationId, userId, action: 'backup.trigger_manual', resource: 'backup', resourceId: backup.id, metadata: { policyId } });
    return backup;
  }

  async initiateRestore(data: {
    backupId: string;
    organizationId: string;
    targetEnvironment: string;
    createdBy: string;
  }) {
    const backup = await this.getBackupById(data.backupId, data.organizationId);
    if (backup.status !== 'completed') throw new ConflictError('Cannot restore from a non-completed backup');
    if (!backup.verified) throw new ConflictError('Cannot restore from an unverified backup');

    const restore = await prisma.restoreOperation.create({
      data: {
        backupId: data.backupId,
        targetEnvironment: data.targetEnvironment,
        status: 'pending',
        createdBy: data.createdBy,
      },
    });

    await auditService.logSuccess({
      organizationId: data.organizationId,
      userId: data.createdBy,
      action: 'restore.initiate',
      resource: 'restore_operation',
      resourceId: restore.id,
      metadata: { backupId: data.backupId, targetEnvironment: data.targetEnvironment },
    });

    return restore;
  }

  async authorizeRestore(restoreId: string, organizationId: string, userId: string) {
    const restore = await prisma.restoreOperation.findFirst({
      where: { id: restoreId, backup: { policy: { organizationId } } },
    });
    if (!restore) throw new NotFoundError('Restore operation not found');
    if (restore.status !== 'pending') throw new ConflictError('Restore is not in pending status');

    const updated = await prisma.restoreOperation.update({
      where: { id: restoreId },
      data: { status: 'authorized', authorizedBy: userId, authorizedAt: new Date() },
    });

    await auditService.logSuccess({ organizationId, userId, action: 'restore.authorize', resource: 'restore_operation', resourceId: restoreId });
    return updated;
  }

  async getRestoreById(id: string, organizationId: string) {
    const restore = await prisma.restoreOperation.findFirst({
      where: { id, backup: { policy: { organizationId } } },
      include: { backup: { include: { policy: true } } },
    });
    if (!restore) throw new NotFoundError('Restore operation not found');
    return restore;
  }

  async getStats(organizationId: string) {
    const [totalPolicies, totalBackups, recentBackups, failedBackups] = await Promise.all([
      prisma.backupPolicy.count({ where: { organizationId, enabled: true } }),
      prisma.backup.count({ where: { policy: { organizationId } } }),
      prisma.backup.count({
        where: {
          policy: { organizationId },
          status: 'completed',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.backup.count({ where: { policy: { organizationId }, status: 'failed' } }),
    ]);
    return { totalPolicies, totalBackups, recentBackups, failedBackups };
  }
}

export const backupService = new BackupService();
