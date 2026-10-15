import { Router } from 'express';
import { z } from 'zod';
import { authenticate, extractOrganization, requireMembership, requirePermission } from '@/middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams, paginationSchema, uuidSchema } from '@/middleware/validation.middleware.js';
import { Permission } from '@/services/authorization.service.js';
import { backupService } from '@/services/backup.service.js';

const router = Router();
router.use(authenticate);
router.use(extractOrganization);
router.use(requireMembership);

const createPolicySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  schedule: z.string().min(1),
  retentionDays: z.number().int().min(1).max(365).default(30),
  targetType: z.enum(['database', 'files', 'configuration']),
  targetConfig: z.record(z.unknown()).default({}),
  storageType: z.enum(['local', 's3', 'azure', 'gcs']),
  storageConfig: z.record(z.unknown()).default({}),
  encryption: z.boolean().default(true),
  verification: z.boolean().default(true),
});

const restoreSchema = z.object({
  targetEnvironment: z.string().min(1).max(100),
});

/** GET /api/v1/backups/stats */
router.get('/stats', requirePermission(Permission.BACKUP_READ), async (req, res) => {
  const stats = await backupService.getStats(req.organizationId!);
  res.json({ success: true, data: stats });
});

/** GET /api/v1/backups/policies */
router.get('/policies', requirePermission(Permission.BACKUP_READ), validateQuery(paginationSchema), async (req, res) => {
  const { page, limit } = req.query as unknown as z.infer<typeof paginationSchema>;
  const result = await backupService.listPolicies(req.organizationId!, limit as number, ((page as number) - 1) * (limit as number));
  res.json({ success: true, data: { ...result, pagination: { page, limit, total: result.total } } });
});

/** POST /api/v1/backups/policies */
router.post('/policies', requirePermission(Permission.BACKUP_CREATE), validateBody(createPolicySchema), async (req, res) => {
  const policy = await backupService.createPolicy({ organizationId: req.organizationId!, ...req.body, createdBy: req.user!.id });
  res.status(201).json({ success: true, data: { policy } });
});

/** GET /api/v1/backups/policies/:id */
router.get('/policies/:id', requirePermission(Permission.BACKUP_READ), validateParams(uuidSchema), async (req, res) => {
  const policy = await backupService.getPolicyById(req.params.id, req.organizationId!);
  res.json({ success: true, data: { policy } });
});

/** PATCH /api/v1/backups/policies/:id */
router.patch('/policies/:id', requirePermission(Permission.BACKUP_CREATE), validateParams(uuidSchema), validateBody(createPolicySchema.partial()), async (req, res) => {
  const policy = await backupService.updatePolicy(req.params.id, req.organizationId!, req.body, req.user!.id);
  res.json({ success: true, data: { policy } });
});

/** DELETE /api/v1/backups/policies/:id */
router.delete('/policies/:id', requirePermission(Permission.BACKUP_DELETE), validateParams(uuidSchema), async (req, res) => {
  await backupService.deletePolicy(req.params.id, req.organizationId!, req.user!.id);
  res.json({ success: true, message: 'Backup policy deleted' });
});

/** POST /api/v1/backups/policies/:id/run */
router.post('/policies/:id/run', requirePermission(Permission.BACKUP_CREATE), validateParams(uuidSchema), async (req, res) => {
  const backup = await backupService.triggerManualBackup(req.params.id, req.organizationId!, req.user!.id);
  res.status(202).json({ success: true, data: { backup } });
});

/** GET /api/v1/backups */
router.get('/', requirePermission(Permission.BACKUP_READ), validateQuery(paginationSchema.extend({ policyId: z.string().uuid().optional() })), async (req, res) => {
  const { page, limit, policyId } = req.query as unknown as z.infer<typeof paginationSchema> & { policyId?: string };
  const result = await backupService.listBackups(req.organizationId!, policyId, limit as number, ((page as number) - 1) * (limit as number));
  res.json({ success: true, data: { ...result, pagination: { page, limit, total: result.total } } });
});

/** GET /api/v1/backups/:id */
router.get('/:id', requirePermission(Permission.BACKUP_READ), validateParams(uuidSchema), async (req, res) => {
  const backup = await backupService.getBackupById(req.params.id, req.organizationId!);
  res.json({ success: true, data: { backup } });
});

/** POST /api/v1/backups/:id/restore */
router.post('/:id/restore', requirePermission(Permission.BACKUP_RESTORE), validateParams(uuidSchema), validateBody(restoreSchema), async (req, res) => {
  const restore = await backupService.initiateRestore({
    backupId: req.params.id,
    organizationId: req.organizationId!,
    targetEnvironment: req.body.targetEnvironment,
    createdBy: req.user!.id,
  });
  res.status(202).json({ success: true, data: { restore } });
});

/** GET /api/v1/backups/restores/:id */
router.get('/restores/:id', requirePermission(Permission.BACKUP_READ), async (req, res) => {
  const restore = await backupService.getRestoreById(req.params.id, req.organizationId!);
  res.json({ success: true, data: { restore } });
});

/** POST /api/v1/backups/restores/:id/authorize */
router.post('/restores/:id/authorize', requirePermission(Permission.BACKUP_RESTORE), async (req, res) => {
  const restore = await backupService.authorizeRestore(req.params.id, req.organizationId!, req.user!.id);
  res.json({ success: true, data: { restore } });
});

export default router;
