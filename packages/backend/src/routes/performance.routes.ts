import { Router } from 'express';
import { z } from 'zod';
import { authenticate, extractOrganization, requireMembership, requirePermission } from '@/middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams, paginationSchema, uuidSchema } from '@/middleware/validation.middleware.js';
import { Permission } from '@/services/authorization.service.js';
import { performanceService } from '@/services/performance.service.js';

const router = Router();
router.use(authenticate);
router.use(extractOrganization);
router.use(requireMembership);

const createReviewSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const recSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.enum(['performance', 'reliability', 'security', 'cost', 'other']),
  impact: z.string().optional(),
  effort: z.enum(['low', 'medium', 'high']).optional(),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});

/** GET /api/v1/performance/reviews */
router.get('/reviews', requirePermission(Permission.PERFORMANCE_READ), validateQuery(paginationSchema), async (req, res) => {
  const { page, limit } = req.query as unknown as z.infer<typeof paginationSchema>;
  const result = await performanceService.listReviews(req.organizationId!, limit as number, ((page as number) - 1) * (limit as number));
  res.json({ success: true, data: { ...result, pagination: { page, limit, total: result.total } } });
});

/** POST /api/v1/performance/reviews */
router.post('/reviews', requirePermission(Permission.PERFORMANCE_WRITE), validateBody(createReviewSchema), async (req, res) => {
  const review = await performanceService.createReview({
    organizationId: req.organizationId!,
    title: req.body.title,
    description: req.body.description,
    startDate: new Date(req.body.startDate),
    endDate: new Date(req.body.endDate),
    createdBy: req.user!.id,
  });
  res.status(201).json({ success: true, data: { review } });
});

/** GET /api/v1/performance/reviews/:id */
router.get('/reviews/:id', requirePermission(Permission.PERFORMANCE_READ), validateParams(uuidSchema), async (req, res) => {
  const review = await performanceService.getReviewById(req.params.id, req.organizationId!);
  res.json({ success: true, data: { review } });
});

/** POST /api/v1/performance/reviews/:id/approve */
router.post('/reviews/:id/approve', requirePermission(Permission.PERFORMANCE_WRITE), validateParams(uuidSchema), async (req, res) => {
  const review = await performanceService.approveReview(req.params.id, req.organizationId!, req.user!.id);
  res.json({ success: true, data: { review } });
});

/** POST /api/v1/performance/reviews/:id/recommendations */
router.post('/reviews/:id/recommendations', requirePermission(Permission.PERFORMANCE_WRITE), validateParams(uuidSchema), validateBody(recSchema), async (req, res) => {
  const rec = await performanceService.addRecommendation(req.params.id, req.organizationId!, {
    ...req.body,
    dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
  }, req.user!.id);
  res.status(201).json({ success: true, data: { recommendation: rec } });
});

/** PATCH /api/v1/performance/reviews/:id/recommendations/:recId */
router.patch('/reviews/:id/recommendations/:recId', requirePermission(Permission.PERFORMANCE_WRITE), validateParams(uuidSchema), validateBody(recSchema.partial()), async (req, res) => {
  const rec = await performanceService.updateRecommendation(req.params.recId, req.params.id, req.organizationId!, req.body, req.user!.id);
  res.json({ success: true, data: { recommendation: rec } });
});

/** GET /api/v1/performance/metrics */
router.get('/metrics', requirePermission(Permission.PERFORMANCE_READ), validateQuery(z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
})), async (req, res) => {
  const q = req.query as unknown as { startDate: string; endDate: string };
  const metrics = await performanceService.collectMetrics(req.organizationId!, new Date(q.startDate), new Date(q.endDate));
  res.json({ success: true, data: { metrics } });
});

export default router;
