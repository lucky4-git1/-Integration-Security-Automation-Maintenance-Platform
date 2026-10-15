import { Router } from 'express';
import { z } from 'zod';
import { authenticate, extractOrganization, requireMembership, requirePermission } from '@/middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams, paginationSchema, uuidSchema } from '@/middleware/validation.middleware.js';
import { Permission } from '@/services/authorization.service.js';
import { securityService } from '@/services/security.service.js';

const router = Router();
router.use(authenticate);
router.use(extractOrganization);
router.use(requireMembership);

const listSchema = paginationSchema.extend({
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
  status: z.enum(['open', 'inProgress', 'resolved', 'accepted', 'falsePositive']).optional(),
  category: z.string().optional(),
});

const updateFindingSchema = z.object({
  status: z.enum(['open', 'inProgress', 'resolved', 'accepted', 'falsePositive']).optional(),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});

const createFindingSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  confidence: z.enum(['high', 'medium', 'low']),
  category: z.string().min(1),
  affectedResource: z.string().optional(),
  evidence: z.record(z.unknown()).optional(),
  impact: z.string().optional(),
  remediation: z.string().optional(),
});

/** GET /api/v1/security/stats */
router.get('/stats', requirePermission(Permission.SECURITY_READ), async (req, res) => {
  const stats = await securityService.getStats(req.organizationId!);
  res.json({ success: true, data: stats });
});

/** GET /api/v1/security/findings */
router.get('/findings', requirePermission(Permission.SECURITY_READ), validateQuery(listSchema), async (req, res) => {
  const { page, limit, severity, status, category } = req.query as unknown as z.infer<typeof listSchema>;
  const result = await securityService.listFindings(req.organizationId!, {
    severity, status, category,
    limit: limit as number,
    offset: ((page as number) - 1) * (limit as number),
  });
  res.json({
    success: true,
    data: {
      findings: result.findings,
      pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / (limit as number)) },
    },
  });
});

/** POST /api/v1/security/findings */
router.post('/findings', requirePermission(Permission.SECURITY_WRITE), validateBody(createFindingSchema), async (req, res) => {
  const finding = await securityService.createFinding({
    organizationId: req.organizationId!,
    ...req.body,
    createdBy: req.user!.id,
  });
  res.status(201).json({ success: true, data: { finding } });
});

/** GET /api/v1/security/findings/:id */
router.get('/findings/:id', requirePermission(Permission.SECURITY_READ), validateParams(uuidSchema), async (req, res) => {
  const finding = await securityService.getFindingById(req.params.id, req.organizationId!);
  res.json({ success: true, data: { finding } });
});

/** PATCH /api/v1/security/findings/:id */
router.patch('/findings/:id', requirePermission(Permission.SECURITY_WRITE), validateParams(uuidSchema), validateBody(updateFindingSchema), async (req, res) => {
  const finding = await securityService.updateFinding(req.params.id, req.organizationId!, {
    ...req.body,
    dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
  }, req.user!.id);
  res.json({ success: true, data: { finding } });
});

/** POST /api/v1/security/assessment */
router.post('/assessment', requirePermission(Permission.SECURITY_AUDIT), async (req, res) => {
  const result = await securityService.runAssessment(req.organizationId!, req.user!.id);
  res.json({ success: true, data: result });
});

export default router;
