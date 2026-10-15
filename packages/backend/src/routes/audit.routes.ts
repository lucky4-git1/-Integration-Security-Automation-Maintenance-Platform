import { Router } from 'express';
import { z } from 'zod';
import { authenticate, extractOrganization, requireMembership, requirePermission } from '@/middleware/auth.middleware.js';
import { Permission } from '@/services/authorization.service.js';
import { auditService } from '@/services/audit.service.js';
import { validateQuery, paginationSchema } from '@/middleware/validation.middleware.js';

const router = Router();

router.use(authenticate);
router.use(extractOrganization);
router.use(requireMembership);

const auditQuerySchema = paginationSchema.extend({
  action: z.string().optional(),
  resource: z.string().optional(),
  userId: z.string().uuid().optional(),
  result: z.enum(['success', 'failure', 'denied']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * GET /api/v1/audit/logs
 * Get audit logs for organization
 */
router.get('/logs', requirePermission(Permission.AUDIT_READ), validateQuery(auditQuerySchema), async (req, res) => {
  if (!req.organizationId) throw new Error('Organization ID required');

  const { page, limit, ...filters } = req.query as unknown as z.infer<typeof auditQuerySchema>;

  const offset = ((page as number) - 1) * (limit as number);

  const result = await auditService.getOrganizationLogs(req.organizationId, {
    ...filters,
    startDate: filters.startDate ? new Date(filters.startDate) : undefined,
    endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    limit: limit as number,
    offset,
  });

  res.json({
    success: true,
    data: {
      logs: result.logs,
      pagination: {
        page: page as number,
        limit: limit as number,
        total: result.total,
        totalPages: Math.ceil(result.total / (limit as number)),
      },
    },
  });
});

export default router;
