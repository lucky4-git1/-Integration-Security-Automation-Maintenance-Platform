import { prisma } from '@/config/database.js';
import { auditService } from '@/services/audit.service.js';
import { NotFoundError, ConflictError } from '@/utils/errors.js';
import type { Prisma } from '@prisma/client';

export class DocumentService {
  async list(organizationId: string, options: { type?: string; status?: string; search?: string; limit?: number; offset?: number } = {}) {
    const where: Record<string, unknown> = { organizationId };
    if (options.type) where.type = options.type;
    if (options.status) where.status = options.status;
    if (options.search) {
      where.OR = [
        { title: { contains: options.search, mode: 'insensitive' } },
        { content: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where, orderBy: { updatedAt: 'desc' },
        take: options.limit ?? 50, skip: options.offset ?? 0,
        select: { id: true, title: true, slug: true, type: true, status: true, version: true, ownerId: true, createdBy: true, createdAt: true, updatedAt: true, publishedAt: true },
      }),
      prisma.document.count({ where }),
    ]);
    return { documents, total };
  }

  async getById(id: string, organizationId: string) {
    const doc = await prisma.document.findFirst({
      where: { id, organizationId },
      include: { versions: { orderBy: { version: 'desc' }, take: 10 } },
    });
    if (!doc) throw new NotFoundError('Document not found');
    return doc;
  }

  async getBySlug(slug: string, organizationId: string) {
    const doc = await prisma.document.findFirst({ where: { slug, organizationId } });
    if (!doc) throw new NotFoundError('Document not found');
    return doc;
  }

  async create(data: {
    organizationId: string; title: string; content: string;
    type: string; ownerId?: string; createdBy: string;
    metadata?: Record<string, unknown>;
  }) {
    const slug = this.generateSlug(data.title);

    const existing = await prisma.document.findFirst({ where: { organizationId: data.organizationId, slug } });
    if (existing) throw new ConflictError('A document with this title already exists');

    const doc = await prisma.document.create({
      data: {
        organizationId: data.organizationId,
        title: data.title,
        slug,
        content: data.content,
        type: data.type,
        status: 'draft',
        version: 1,
        ownerId: data.ownerId,
        createdBy: data.createdBy,
        metadata: (data.metadata ?? {}) as unknown as Prisma.InputJsonValue,
        versions: {
          create: {
            version: 1,
            content: data.content,
            createdBy: data.createdBy,
          },
        },
      },
    });

    await auditService.logSuccess({
      organizationId: data.organizationId, userId: data.createdBy,
      action: 'document.create', resource: 'document', resourceId: doc.id,
    });
    return doc;
  }

  async update(id: string, organizationId: string, data: {
    title?: string; content?: string; metadata?: Record<string, unknown>;
  }, userId: string) {
    const existing = await this.getById(id, organizationId);

    const updateData: Record<string, unknown> = { ...data };
    let newVersion = existing.version;

    if (data.content && data.content !== existing.content) {
      newVersion = existing.version + 1;
      updateData.version = newVersion;
    }

    const doc = await prisma.document.update({ where: { id }, data: updateData });

    if (data.content && newVersion > existing.version) {
      await prisma.documentVersion.create({
        data: { documentId: id, version: newVersion, content: data.content, createdBy: userId },
      });
    }

    await auditService.logSuccess({
      organizationId, userId, action: 'document.update',
      resource: 'document', resourceId: id, changes: { fields: Object.keys(data) },
    });
    return doc;
  }

  async publish(id: string, organizationId: string, userId: string) {
    const doc = await this.getById(id, organizationId);
    if (doc.status === 'published') throw new ConflictError('Document is already published');

    const updated = await prisma.document.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date() },
    });
    await auditService.logSuccess({ organizationId, userId, action: 'document.publish', resource: 'document', resourceId: id });
    return updated;
  }

  async delete(id: string, organizationId: string, userId: string) {
    await this.getById(id, organizationId);
    await prisma.document.delete({ where: { id } });
    await auditService.logSuccess({ organizationId, userId, action: 'document.delete', resource: 'document', resourceId: id });
  }

  async getVersionHistory(id: string, organizationId: string) {
    await this.getById(id, organizationId);
    return prisma.documentVersion.findMany({ where: { documentId: id }, orderBy: { version: 'desc' } });
  }

  private generateSlug(title: string): string {
    return title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim().replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100) + '-' + Date.now().toString(36);
  }
}

export const documentService = new DocumentService();
