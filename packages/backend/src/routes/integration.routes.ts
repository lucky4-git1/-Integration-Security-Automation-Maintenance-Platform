import { Router } from 'express';
import { z } from 'zod';
import { authenticate, extractOrganization, requireMembership, requirePermission } from '@/middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams, paginationSchema, uuidSchema } from '@/middleware/validation.middleware.js';
import { Permission } from '@/services/authorization.service.js';
import { integrationService } from '@/services/integration.service.js';
import { listProviders, isProviderSupported } from '@/integrations/adapter.factory.js';
import { ValidationError } from '@/utils/errors.js';
import rateLimit from 'express-rate-limit';

const router = Router();
router.use(authenticate);
router.use(extractOrganization);
router.use(requireMembership);

const testLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

const createSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.string().min(1),
  config: z.record(z.unknown()).default({}),
  credentials: z.record(z.unknown()),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
  credentials: z.record(z.unknown()).optional(),
});

const listSchema = paginationSchema.extend({
  provider: z.string().optional(),
  status: z.enum(['pending', 'active', 'error', 'disconnected']).optional(),
});

/** GET /api/v1/integrations/providers */
router.get('/providers', requirePermission(Permission.INTEGRATION_READ), (_req, res) => {
  res.json({ success: true, data: { providers: listProviders() } });
});

/** GET /api/v1/integrations */
router.get('/', requirePermission(Permission.INTEGRATION_READ), validateQuery(listSchema), async (req, res) => {
  const { page, limit, provider, status } = req.query as unknown as z.infer<typeof listSchema>;
  const result = await integrationService.list(req.organizationId!, {
    provider, status,
    limit: limit as number,
    offset: ((page as number) - 1) * (limit as number),
  });
  res.json({
    success: true,
    data: {
      integrations: result.integrations,
      pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / (limit as number)) },
    },
  });
});

/** GET /api/v1/integrations/stats */
router.get('/stats', requirePermission(Permission.INTEGRATION_READ), async (req, res) => {
  const stats = await integrationService.getStats(req.organizationId!);
  res.json({ success: true, data: stats });
});

/** GET /api/v1/integrations/:id */
router.get('/:id', requirePermission(Permission.INTEGRATION_READ), validateParams(uuidSchema), async (req, res) => {
  const integration = await integrationService.getById(req.params.id, req.organizationId!);
  res.json({ success: true, data: { integration } });
});

/** POST /api/v1/integrations */
router.post('/', requirePermission(Permission.INTEGRATION_WRITE), validateBody(createSchema), async (req, res) => {
  if (!isProviderSupported(req.body.provider)) {
    throw new ValidationError(`Unsupported provider: ${req.body.provider}. Supported: ${listProviders().map(p => p.provider).join(', ')}`);
  }
  const integration = await integrationService.create({
    organizationId: req.organizationId!,
    name: req.body.name,
    provider: req.body.provider,
    config: req.body.config,
    credentials: req.body.credentials,
    createdBy: req.user!.id,
  });
  res.status(201).json({ success: true, data: { integration: { ...integration, credentials: '[REDACTED]' } } });
});

/** PATCH /api/v1/integrations/:id */
router.patch('/:id', requirePermission(Permission.INTEGRATION_WRITE), validateParams(uuidSchema), validateBody(updateSchema), async (req, res) => {
  const integration = await integrationService.update(req.params.id, req.organizationId!, req.body, req.user!.id);
  res.json({ success: true, data: { integration: { ...integration, credentials: '[REDACTED]' } } });
});

/** DELETE /api/v1/integrations/:id */
router.delete('/:id', requirePermission(Permission.INTEGRATION_DELETE), validateParams(uuidSchema), async (req, res) => {
  await integrationService.delete(req.params.id, req.organizationId!, req.user!.id);
  res.json({ success: true, message: 'Integration deleted' });
});

/** POST /api/v1/integrations/:id/test */
router.post('/:id/test', requirePermission(Permission.INTEGRATION_READ), testLimiter, validateParams(uuidSchema), async (req, res) => {
  const result = await integrationService.testConnection(req.params.id, req.organizationId!, req.user!.id);
  res.json({ success: true, data: result });
});

/** GET /api/v1/integrations/:id/webhooks */
router.get('/:id/webhooks', requirePermission(Permission.INTEGRATION_READ), validateParams(uuidSchema), validateQuery(paginationSchema), async (req, res) => {
  const { page, limit } = req.query as unknown as z.infer<typeof paginationSchema>;
  const result = await integrationService.getWebhookDeliveries(req.params.id, req.organizationId!, limit as number, ((page as number) - 1) * (limit as number));
  res.json({ success: true, data: { ...result, pagination: { page, limit, total: result.total } } });
});

export default router;
