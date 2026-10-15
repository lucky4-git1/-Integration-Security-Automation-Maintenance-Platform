import { prisma } from '@/config/database.js';
import { auditService } from '@/services/audit.service.js';
import { NotFoundError } from '@/utils/errors.js';
import type { Prisma } from '@prisma/client';

export class PerformanceService {
  async listReviews(organizationId: string, limit = 20, offset = 0) {
    const [reviews, total] = await Promise.all([
      prisma.performanceReview.findMany({
        where: { organizationId }, orderBy: { createdAt: 'desc' },
        take: limit, skip: offset,
        include: { _count: { select: { recommendations: true } } },
      }),
      prisma.performanceReview.count({ where: { organizationId } }),
    ]);
    return { reviews, total };
  }

  async getReviewById(id: string, organizationId: string) {
    const review = await prisma.performanceReview.findFirst({
      where: { id, organizationId },
      include: { recommendations: { orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }] } },
    });
    if (!review) throw new NotFoundError('Performance review not found');
    return review;
  }

  async createReview(data: {
    organizationId: string; title: string; description?: string;
    startDate: Date; endDate: Date; createdBy: string;
  }) {
    // Collect real metrics from recorded telemetry
    const metrics = await this.collectMetrics(data.organizationId, data.startDate, data.endDate);

    const review = await prisma.performanceReview.create({
      data: {
        organizationId: data.organizationId,
        title: data.title,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        metrics: metrics as unknown as Prisma.InputJsonValue,
        findings: [],
        status: 'inProgress',
        createdBy: data.createdBy,
      },
    });

    await auditService.logSuccess({
      organizationId: data.organizationId, userId: data.createdBy,
      action: 'performance_review.create', resource: 'performance_review', resourceId: review.id,
    });
    return review;
  }

  async collectMetrics(organizationId: string, startDate: Date, endDate: Date): Promise<Record<string, unknown>> {
    const [
      totalExecutions,
      executionsByStatus,
      avgDuration,
      totalIncidents,
      incidentsBySeverity,
      resolvedIncidents,
      totalBackups,
      successfulBackups,
      openFindings,
    ] = await Promise.all([
      prisma.automationExecution.count({ where: { organizationId, createdAt: { gte: startDate, lte: endDate } } }),
      prisma.automationExecution.groupBy({
        by: ['status'],
        where: { organizationId, createdAt: { gte: startDate, lte: endDate } },
        _count: true,
        _avg: { duration: true },
      }),
      prisma.automationExecution.aggregate({
        where: { organizationId, status: 'succeeded', createdAt: { gte: startDate, lte: endDate } },
        _avg: { duration: true },
        _min: { duration: true },
        _max: { duration: true },
      }),
      prisma.incident.count({ where: { organizationId, createdAt: { gte: startDate, lte: endDate } } }),
      prisma.incident.groupBy({
        by: ['severity'],
        where: { organizationId, createdAt: { gte: startDate, lte: endDate } },
        _count: true,
      }),
      prisma.incident.count({ where: { organizationId, status: 'resolved', createdAt: { gte: startDate, lte: endDate } } }),
      prisma.backup.count({ where: { policy: { organizationId }, createdAt: { gte: startDate, lte: endDate } } }),
      prisma.backup.count({ where: { policy: { organizationId }, status: 'completed', createdAt: { gte: startDate, lte: endDate } } }),
      prisma.securityFinding.count({ where: { organizationId, status: 'open' } }),
    ]);

    const succeededCount = executionsByStatus.find(e => e.status === 'succeeded')?._count ?? 0;
    const successRate = totalExecutions > 0 ? (succeededCount / totalExecutions) * 100 : null;

    return {
      period: { startDate, endDate },
      automations: {
        totalExecutions,
        successRate: successRate !== null ? Math.round(successRate * 100) / 100 : 'no_data',
        byStatus: executionsByStatus,
        avgDurationMs: avgDuration._avg.duration,
        minDurationMs: avgDuration._min.duration,
        maxDurationMs: avgDuration._max.duration,
      },
      incidents: {
        total: totalIncidents,
        resolved: resolvedIncidents,
        resolutionRate: totalIncidents > 0 ? Math.round((resolvedIncidents / totalIncidents) * 100) : 'no_data',
        bySeverity: incidentsBySeverity,
      },
      backups: {
        total: totalBackups,
        successful: successfulBackups,
        successRate: totalBackups > 0 ? Math.round((successfulBackups / totalBackups) * 100) : 'no_data',
      },
      security: { openFindings },
      collectedAt: new Date().toISOString(),
      dataSource: 'recorded_telemetry',
    };
  }

  async addRecommendation(reviewId: string, organizationId: string, data: {
    title: string; description: string; priority: string; category: string;
    impact?: string; effort?: string; assignedTo?: string; dueDate?: Date;
  }, userId: string) {
    await this.getReviewById(reviewId, organizationId);

    const rec = await prisma.improvementRecommendation.create({
      data: { reviewId, ...data, status: 'pending' },
    });

    await auditService.logSuccess({
      organizationId, userId, action: 'recommendation.create',
      resource: 'improvement_recommendation', resourceId: rec.id,
    });
    return rec;
  }

  async updateRecommendation(id: string, reviewId: string, organizationId: string, data: Record<string, unknown>, userId: string) {
    await this.getReviewById(reviewId, organizationId);

    const updateData = { ...data };
    if (data.status === 'completed') (updateData as Record<string, unknown>).completedAt = new Date();

    const rec = await prisma.improvementRecommendation.update({ where: { id }, data: updateData });
    await auditService.logSuccess({ organizationId, userId, action: 'recommendation.update', resource: 'improvement_recommendation', resourceId: id, changes: data });
    return rec;
  }

  async approveReview(id: string, organizationId: string, userId: string) {
    await this.getReviewById(id, organizationId);
    const review = await prisma.performanceReview.update({
      where: { id },
      data: { status: 'approved', approvedBy: userId, approvedAt: new Date() },
    });
    await auditService.logSuccess({ organizationId, userId, action: 'performance_review.approve', resource: 'performance_review', resourceId: id });
    return review;
  }
}

export const performanceService = new PerformanceService();
