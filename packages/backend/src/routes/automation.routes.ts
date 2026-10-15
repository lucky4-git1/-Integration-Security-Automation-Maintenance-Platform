import { Router } from 'express';
import { z } from 'zod';
import { authenticate, extractOrganization, requireMembership, requirePermission } from '@/middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams, paginationSchema, uuidSchema } from '@/middleware/validation.middleware.js';
import { Permission } from '@/services/authorization.service.js';
import { automationService } from '@/services/automation.service.js';

const router = Router();
router.use(authenticate);
router.use(extractOrganization);
router.use(requireMembership);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  type: z.enum(['scheduled', 'webhook', 'manual', 'api']),
  schedule: z.string().optional(),
  timezone: z.string().default('UTC'),
  config: z.record(z.unknown()).default({}),
  retryPolicy: z.record(z.unknown()).optional(),
  concurrency: z.number().int().min(1).max(20).default(1),
  timeout: z.number().int().min(1000).max(3600000).default(300000),
});

const updateSchema = createSchema.partial().omit({ type: true });

const listSchema = paginationSchema.extend({
  type: z.enum(['scheduled', 'webhook', 'manual', 'api']).optional(),
  enabled: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

const executionListSchema = paginationSchema.extend({
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'timeout', 'cancelled']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/** GET /api/v1/automations */
router.get('/', requirePermission(Permission.AUTOMATION_READ), validateQuery(listSchema), async (req, res) => {
  const { page, limit, type, enabled } = req.query as unknown as z.infer<typeof listSchema>;
  const result = await automationService.list(req.organizationId!, {
    type, enabled,
    limit: limit as number,
    offset: ((page as number) - 1) * (limit as number),
  });
  res.json({
    success: true,
    data: {
      automations: result.automations,
      pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / (limit as number)) },
    },
  });
});

/** GET /api/v1/automations/executions */
router.get('/executions', requirePermission(Permission.AUTOMATION_READ), validateQuery(executionListSchema), async (req, res) => {
  const { page, limit, status, startDate, endDate } = req.query as unknown as z.infer<typeof executionListSchema>;
  const result = await automationService.listExecutions(req.organizationId!, undefined, {
    status, limit: limit as number,
    offset: ((page as number) - 1) * (limit as number),
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  });
  res.json({
    success: true,
    data: {
      executions: result.executions,
      pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / (limit as number)) },
    },
  });
});

/** GET /api/v1/automations/stats */
router.get('/stats', requirePermission(Permission.AUTOMATION_READ), validateQuery(z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})), async (req, res) => {
  const q = req.query as unknown as { startDate?: string; endDate?: string };
  const stats = await automationService.getExecutionStats(
    req.organizationId!,
    q.startDate ? new Date(q.startDate) : undefined,
    q.endDate ? new Date(q.endDate) : undefined,
  );
  res.json({ success: true, data: stats });
});

/** GET /api/v1/automations/:id */
router.get('/:id', requirePermission(Permission.AUTOMATION_READ), validateParams(uuidSchema), async (req, res) => {
  const automation = await automationService.getById(req.params.id, req.organizationId!);
  res.json({ success: true, data: { automation } });
});

/** POST /api/v1/automations */
router.post('/', requirePermission(Permission.AUTOMATION_WRITE), validateBody(createSchema), async (req, res) => {
  const automation = await automationService.create({
    organizationId: req.organizationId!,
    ...req.body,
    createdBy: req.user!.id,
  });
  res.status(201).json({ success: true, data: { automation } });
});

/** PATCH /api/v1/automations/:id */
router.patch('/:id', requirePermission(Permission.AUTOMATION_WRITE), validateParams(uuidSchema), validateBody(updateSchema), async (req, res) => {
  const automation = await automationService.update(req.params.id, req.organizationId!, req.body, req.user!.id);
  res.json({ success: true, data: { automation } });
});

/** DELETE /api/v1/automations/:id */
router.delete('/:id', requirePermission(Permission.AUTOMATION_DELETE), validateParams(uuidSchema), async (req, res) => {
  await automationService.delete(req.params.id, req.organizationId!, req.user!.id);
  res.json({ success: true, message: 'Automation deleted' });
});

/** POST /api/v1/automations/:id/toggle */
router.post('/:id/toggle', requirePermission(Permission.AUTOMATION_WRITE), validateParams(uuidSchema), async (req, res) => {
  const automation = await automationService.toggleEnabled(req.params.id, req.organizationId!, req.user!.id);
  res.json({ success: true, data: { automation } });
});

/** POST /api/v1/automations/:id/run */
router.post('/:id/run', requirePermission(Permission.AUTOMATION_EXECUTE), validateParams(uuidSchema), validateBody(z.object({ input: z.record(z.unknown()).optional() })), async (req, res) => {
  const execution = await automationService.enqueueManualRun(req.params.id, req.organizationId!, req.user!.id, req.body.input);
  res.status(202).json({ success: true, data: { execution } });
});

/** GET /api/v1/automations/:id/executions */
router.get('/:id/executions', requirePermission(Permission.AUTOMATION_READ), validateParams(uuidSchema), validateQuery(executionListSchema), async (req, res) => {
  const { page, limit, status, startDate, endDate } = req.query as unknown as z.infer<typeof executionListSchema>;
  const result = await automationService.listExecutions(req.organizationId!, req.params.id, {
    status, limit: limit as number,
    offset: ((page as number) - 1) * (limit as number),
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  });
  res.json({
    success: true,
    data: {
      executions: result.executions,
      pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / (limit as number)) },
    },
  });
});

/** GET /api/v1/automations/executions/:execId */
router.get('/executions/:execId', requirePermission(Permission.AUTOMATION_READ), async (req, res) => {
  const execution = await automationService.getExecution(req.params.execId, req.organizationId!);
  res.json({ success: true, data: { execution } });
});

/** POST /api/v1/automations/executions/:execId/cancel */
router.post('/executions/:execId/cancel', requirePermission(Permission.AUTOMATION_EXECUTE), async (req, res) => {
  await automationService.cancelExecution(req.params.execId, req.organizationId!, req.user!.id);
  res.json({ success: true, message: 'Execution cancelled' });
});

export default router;
