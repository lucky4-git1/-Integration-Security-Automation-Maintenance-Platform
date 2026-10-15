import { Router } from 'express';
import { z } from 'zod';
import { authenticate, extractOrganization, requireMembership, requirePermission } from '@/middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams, paginationSchema, uuidSchema } from '@/middleware/validation.middleware.js';
import { Permission } from '@/services/authorization.service.js';
import { documentService } from '@/services/document.service.js';

const router = Router();
router.use(authenticate);
router.use(extractOrganization);
router.use(requireMembership);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  type: z.enum(['runbook', 'architecture', 'procedure', 'policy', 'handover', 'guide', 'other']),
  ownerId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const listSchema = paginationSchema.extend({
  type: z.string().optional(),
  status: z.enum(['draft', 'review', 'published']).optional(),
  search: z.string().optional(),
});

/** GET /api/v1/documents */
router.get('/', requirePermission(Permission.DOC_READ), validateQuery(listSchema), async (req, res) => {
  const { page, limit, type, status, search } = req.query as unknown as z.infer<typeof listSchema>;
  const result = await documentService.list(req.organizationId!, {
    type, status, search,
    limit: limit as number,
    offset: ((page as number) - 1) * (limit as number),
  });
  res.json({
    success: true,
    data: { documents: result.documents, pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / (limit as number)) } },
  });
});

/** POST /api/v1/documents */
router.post('/', requirePermission(Permission.DOC_WRITE), validateBody(createSchema), async (req, res) => {
  const doc = await documentService.create({
    organizationId: req.organizationId!,
    ...req.body,
    createdBy: req.user!.id,
  });
  res.status(201).json({ success: true, data: { document: doc } });
});

/** GET /api/v1/documents/:id */
router.get('/:id', requirePermission(Permission.DOC_READ), validateParams(uuidSchema), async (req, res) => {
  const doc = await documentService.getById(req.params.id, req.organizationId!);
  res.json({ success: true, data: { document: doc } });
});

/** PATCH /api/v1/documents/:id */
router.patch('/:id', requirePermission(Permission.DOC_WRITE), validateParams(uuidSchema), validateBody(updateSchema), async (req, res) => {
  const doc = await documentService.update(req.params.id, req.organizationId!, req.body, req.user!.id);
  res.json({ success: true, data: { document: doc } });
});

/** DELETE /api/v1/documents/:id */
router.delete('/:id', requirePermission(Permission.DOC_DELETE), validateParams(uuidSchema), async (req, res) => {
  await documentService.delete(req.params.id, req.organizationId!, req.user!.id);
  res.json({ success: true, message: 'Document deleted' });
});

/** POST /api/v1/documents/:id/publish */
router.post('/:id/publish', requirePermission(Permission.DOC_PUBLISH), validateParams(uuidSchema), async (req, res) => {
  const doc = await documentService.publish(req.params.id, req.organizationId!, req.user!.id);
  res.json({ success: true, data: { document: doc } });
});

/** GET /api/v1/documents/:id/versions */
router.get('/:id/versions', requirePermission(Permission.DOC_READ), validateParams(uuidSchema), async (req, res) => {
  const versions = await documentService.getVersionHistory(req.params.id, req.organizationId!);
  res.json({ success: true, data: { versions } });
});

export default router;
