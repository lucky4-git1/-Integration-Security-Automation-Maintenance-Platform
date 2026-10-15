import { prisma } from '@/config/database.js';
import { encrypt, decrypt } from '@/utils/crypto.js';
import { auditService } from '@/services/audit.service.js';
import { NotFoundError, ConflictError, IntegrationError } from '@/utils/errors.js';
import type { Integration, Prisma } from '@prisma/client';

export interface CreateIntegrationData {
  organizationId: string;
  name: string;
  provider: string;
  config: Record<string, unknown>;
  credentials: Record<string, unknown>;
  createdBy: string;
}

export interface UpdateIntegrationData {
  name?: string;
  config?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

export interface IntegrationListOptions {
  provider?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export class IntegrationService {
  async list(organizationId: string, options: IntegrationListOptions = {}) {
    const where: Record<string, unknown> = { organizationId };
    if (options.provider) where.provider = options.provider;
    if (options.status) where.status = options.status;

    const [integrations, total] = await Promise.all([
      prisma.integration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit ?? 50,
        skip: options.offset ?? 0,
        select: {
          id: true,
          organizationId: true,
          name: true,
          provider: true,
          config: true,
          status: true,
          lastSyncAt: true,
          lastErrorAt: true,
          lastErrorMessage: true,
          metadata: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
          // Never expose credentials field
        },
      }),
      prisma.integration.count({ where }),
    ]);

    return { integrations, total };
  }

  async getById(id: string, organizationId: string) {
    const integration = await prisma.integration.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        provider: true,
        config: true,
        status: true,
        lastSyncAt: true,
        lastErrorAt: true,
        lastErrorMessage: true,
        metadata: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { executions: true, webhookDeliveries: true } },
      },
    });

    if (!integration) throw new NotFoundError('Integration not found');
    return integration;
  }

  async create(data: CreateIntegrationData): Promise<Integration> {
    // Check name uniqueness within org
    const existing = await prisma.integration.findFirst({
      where: { organizationId: data.organizationId, name: data.name },
    });
    if (existing) throw new ConflictError('Integration name already exists in this organization');

    const encryptedCredentials = encrypt(JSON.stringify(data.credentials));

    const integration = await prisma.integration.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        provider: data.provider,
        config: data.config as unknown as Prisma.InputJsonValue,
        credentials: encryptedCredentials,
        status: 'pending',
        createdBy: data.createdBy,
      },
    });

    await auditService.logSuccess({
      organizationId: data.organizationId,
      userId: data.createdBy,
      action: 'integration.create',
      resource: 'integration',
      resourceId: integration.id,
      metadata: { provider: data.provider },
    });

    return integration;
  }

  async update(id: string, organizationId: string, data: UpdateIntegrationData, userId: string) {
    await this.getById(id, organizationId);

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.config !== undefined) updateData.config = data.config;
    if (data.credentials !== undefined) {
      updateData.credentials = encrypt(JSON.stringify(data.credentials));
    }

    const integration = await prisma.integration.update({
      where: { id },
      data: updateData as any,
    });

    await auditService.logSuccess({
      organizationId,
      userId,
      action: 'integration.update',
      resource: 'integration',
      resourceId: id,
      changes: { fields: Object.keys(updateData) },
    });

    return integration;
  }

  async delete(id: string, organizationId: string, userId: string) {
    await this.getById(id, organizationId);

    await prisma.integration.delete({ where: { id } });

    await auditService.logSuccess({
      organizationId,
      userId,
      action: 'integration.delete',
      resource: 'integration',
      resourceId: id,
    });
  }

  async updateStatus(id: string, status: string, errorMessage?: string) {
    return prisma.integration.update({
      where: { id },
      data: {
        status,
        ...(status === 'error' ? { lastErrorAt: new Date(), lastErrorMessage: errorMessage } : {}),
        ...(status === 'active' ? { lastSyncAt: new Date(), lastErrorAt: null, lastErrorMessage: null } : {}),
      },
    });
  }

  async getDecryptedCredentials(id: string, organizationId: string): Promise<Record<string, unknown>> {
    const integration = await prisma.integration.findFirst({
      where: { id, organizationId },
      select: { credentials: true },
    });
    if (!integration) throw new NotFoundError('Integration not found');
    try {
      return JSON.parse(decrypt(integration.credentials));
    } catch {
      throw new IntegrationError('Failed to decrypt credentials');
    }
  }

  async testConnection(id: string, organizationId: string, userId: string): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const integration = await prisma.integration.findFirst({
      where: { id, organizationId },
    });
    if (!integration) throw new NotFoundError('Integration not found');

    const start = Date.now();
    try {
      const credentials = await this.getDecryptedCredentials(id, organizationId);
      const { getAdapter } = await import('@/integrations/adapter.factory.js');
      const adapter = getAdapter(integration.provider);
      const result = await adapter.testConnection(integration.config as Record<string, unknown>, credentials);
      const latencyMs = Date.now() - start;

      await this.updateStatus(id, result.success ? 'active' : 'error', result.message);

      await auditService.logSuccess({
        organizationId,
        userId,
        action: 'integration.test',
        resource: 'integration',
        resourceId: id,
        metadata: { success: result.success, latencyMs },
      });

      return { ...result, latencyMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed';
      await this.updateStatus(id, 'error', message);
      return { success: false, message };
    }
  }

  async getWebhookDeliveries(integrationId: string, organizationId: string, limit = 50, offset = 0) {
    // Verify ownership
    await this.getById(integrationId, organizationId);

    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where: { integrationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.webhookDelivery.count({ where: { integrationId } }),
    ]);

    return { deliveries, total };
  }

  async getStats(organizationId: string) {
    const [total, byStatus, byProvider] = await Promise.all([
      prisma.integration.count({ where: { organizationId } }),
      prisma.integration.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: true,
      }),
      prisma.integration.groupBy({
        by: ['provider'],
        where: { organizationId },
        _count: true,
      }),
    ]);

    return { total, byStatus, byProvider };
  }
}

export const integrationService = new IntegrationService();
