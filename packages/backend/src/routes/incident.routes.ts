import { Router } from 'express';
import { z } from 'zod';
import { authenticate, extractOrganization, requireMembership, requirePermission } from '@/middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams, paginationSchema, uuidSchema } from '@/middleware/validation.middleware.js';
import { Permission } from '@/services/authorization.service.js';
import { incidentService } from '@/services/incident.service.js';
import { notificationService } from '@/services/notification.service.js';

const router = Router();
router.use(authenticate);
router.use(extractOrganization);
router.use(requireMembership);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  source: z.enum(['automation', 'integration', 'manual', 'system']).default('manual'),
  sourceId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
  assignedTo: z.string().uuid().optional(),
});

const resolveSchema = z.object({
  resolution: z.string().min(1, 'Resolution notes are required'),
});

const listSchema = paginationSchema.extend({
  status: z.enum(['detected', 'acknowledged', 'investigating', 'resolved']).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
  source: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const channelCreateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['email', 'slack', 'webhook']),
  config: z.record(z.unknown()),
});

/** GET /api/v1/incidents/stats */
router.get('/stats', requirePermission(Permission.INCIDENT_READ), async (req, res) => {
  const stats = await incidentService.getStats(req.organizationId!);
  res.json({ success: true, data: stats });
});

/** GET /api/v1/incidents */
router.get('/', requirePermission(Permission.INCIDENT_READ), validateQuery(listSchema), async (req, res) => {
  const { page, limit, status, severity, source, startDate, endDate } = req.query as unknown as z.infer<typeof listSchema>;
  const result = await incidentService.list(req.organizationId!, {
    status, severity, source,
    limit: limit as number,
    offset: ((page as number) - 1) * (limit as number),
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  });
  res.json({
    success: true,
    data: {
      incidents: result.incidents,
      pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / (limit as number)) },
    },
  });
});

/** GET /api/v1/incidents/:id */
router.get('/:id', requirePermission(Permission.INCIDENT_READ), validateParams(uuidSchema), async (req, res) => {
  const incident = await incidentService.getById(req.params.id, req.organizationId!);
  res.json({ success: true, data: { incident } });
});

/** POST /api/v1/incidents */
router.post('/', requirePermission(Permission.INCIDENT_WRITE), validateBody(createSchema), async (req, res) => {
  const incident = await incidentService.create({
    organizationId: req.organizationId!,
    ...req.body,
    createdBy: req.user!.id,
  });
  // Fire notifications asynchronously
  notificationService.sendIncidentNotification(incident).catch(() => {});
  res.status(201).json({ success: true, data: { incident } });
});

/** PATCH /api/v1/incidents/:id */
router.patch('/:id', requirePermission(Permission.INCIDENT_WRITE), validateParams(uuidSchema), validateBody(updateSchema), async (req, res) => {
  const incident = await incidentService.update(req.params.id, req.organizationId!, req.body, req.user!.id);
  res.json({ success: true, data: { incident } });
});

/** POST /api/v1/incidents/:id/acknowledge (or /ack) */
router.post(['/:id/acknowledge', '/:id/ack'], requirePermission(Permission.INCIDENT_WRITE), validateParams(uuidSchema), async (req, res) => {
  const incident = await incidentService.acknowledge(req.params.id, req.organizationId!, req.user!.id);
  res.json({ success: true, data: { incident } });
});

/** POST /api/v1/incidents/:id/investigate */
router.post('/:id/investigate', requirePermission(Permission.INCIDENT_WRITE), validateParams(uuidSchema), async (req, res) => {
  const incident = await incidentService.investigate(req.params.id, req.organizationId!, req.user!.id);
  res.json({ success: true, data: { incident } });
});

/** POST /api/v1/incidents/:id/resolve */
router.post('/:id/resolve', requirePermission(Permission.INCIDENT_RESOLVE), validateParams(uuidSchema), validateBody(resolveSchema), async (req, res) => {
  const incident = await incidentService.resolve(req.params.id, req.organizationId!, req.user!.id, req.body.resolution);
  res.json({ success: true, data: { incident } });
});

/** GET /api/v1/incidents/channels */
router.get('/channels', requirePermission(Permission.INCIDENT_READ), async (req, res) => {
  const channels = await notificationService.listChannels(req.organizationId!);
  res.json({ success: true, data: { channels } });
});

/** POST /api/v1/incidents/channels */
router.post('/channels', requirePermission(Permission.INCIDENT_WRITE), validateBody(channelCreateSchema), async (req, res) => {
  const channel = await notificationService.createChannel({
    organizationId: req.organizationId!,
    ...req.body,
    createdBy: req.user!.id,
  });
  res.status(201).json({ success: true, data: { channel } });
});

/** DELETE /api/v1/incidents/channels/:channelId */
router.delete('/channels/:channelId', requirePermission(Permission.INCIDENT_WRITE), async (req, res) => {
  await notificationService.deleteChannel(req.params.channelId, req.organizationId!);
  res.json({ success: true, message: 'Channel deleted' });
});

/** GET /api/v1/incidents/:id/notifications */
router.get('/:id/notifications', requirePermission(Permission.INCIDENT_READ), validateParams(uuidSchema), async (req, res) => {
  const notifications = await notificationService.getDeliveryHistory(req.organizationId!, req.params.id);
  res.json({ success: true, data: { notifications } });
});

export default router;
