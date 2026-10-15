import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@/config/database.js';
import { authenticate, requirePermission } from '@/middleware/auth.middleware.js';
import { validateBody, validateParams, uuidSchema } from '@/middleware/validation.middleware.js';
import { Permission } from '@/services/authorization.service.js';
import { auditService } from '@/services/audit.service.js';
import { NotFoundError, ConflictError } from '@/utils/errors.js';

const router = Router();

// Validation schemas
const createOrgSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Invalid slug format'),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  settings: z.record(z.unknown()).optional(),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  roleId: z.string().uuid(),
});

/**
 * GET /api/v1/organizations
 * List user's organizations
 */
router.get('/', authenticate, async (req, res) => {
  if (!req.user) throw new Error('User not authenticated');

  const organizations = await prisma.organization.findMany({
    where: {
      members: {
        some: {
          userId: req.user.id,
        },
      },
    },
    include: {
      _count: {
        select: {
          members: true,
          integrations: true,
          automations: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: { organizations },
  });
});

/**
 * POST /api/v1/organizations
 * Create new organization
 */
router.post('/', authenticate, validateBody(createOrgSchema), async (req, res) => {
  if (!req.user) throw new Error('User not authenticated');

  // Check if slug is available
  const existingOrg = await prisma.organization.findUnique({
    where: { slug: req.body.slug },
  });

  if (existingOrg) {
    throw new ConflictError('Organization slug already exists');
  }

  // Get owner role
  const ownerRole = await prisma.role.findUnique({
    where: { slug: 'owner' },
  });

  if (!ownerRole) {
    throw new Error('Owner role not found');
  }

  // Create organization with owner membership
  const organization = await prisma.organization.create({
    data: {
      name: req.body.name,
      slug: req.body.slug,
      members: {
        create: {
          userId: req.user.id,
          roleId: ownerRole.id,
        },
      },
    },
    include: {
      members: {
        include: {
          role: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  // Audit log
  await auditService.logSuccess({
    organizationId: organization.id,
    userId: req.user.id,
    action: 'organization.create',
    resource: 'organization',
    resourceId: organization.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(201).json({
    success: true,
    data: { organization },
  });
});

/**
 * GET /api/v1/organizations/:id
 * Get organization details
 */
router.get('/:id', authenticate, validateParams(uuidSchema), async (req, res) => {
  if (!req.user) throw new Error('User not authenticated');

  const organization = await prisma.organization.findFirst({
    where: {
      id: req.params.id,
      members: {
        some: {
          userId: req.user.id,
        },
      },
    },
    include: {
      members: {
        include: {
          role: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      _count: {
        select: {
          integrations: true,
          automations: true,
          incidents: true,
          backupPolicies: true,
        },
      },
    },
  });

  if (!organization) {
    throw new NotFoundError('Organization not found');
  }

  res.json({
    success: true,
    data: { organization },
  });
});

/**
 * PATCH /api/v1/organizations/:id
 * Update organization
 */
router.patch(
  '/:id',
  authenticate,
  validateParams(uuidSchema),
  validateBody(updateOrgSchema),
  async (req, res) => {
    if (!req.user) throw new Error('User not authenticated');

    // Set organization context
    req.organizationId = req.params.id;

    // Check permission
    await requirePermission(Permission.ORG_WRITE)(req, res, () => {});

    const organization = await prisma.organization.update({
      where: { id: req.params.id },
      data: req.body,
    });

    // Audit log
    await auditService.logSuccess({
      organizationId: organization.id,
      userId: req.user.id,
      action: 'organization.update',
      resource: 'organization',
      resourceId: organization.id,
      changes: req.body,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: { organization },
    });
  }
);

/**
 * GET /api/v1/organizations/:id/members
 * List organization members
 */
router.get('/:id/members', authenticate, validateParams(uuidSchema), async (req, res) => {
  if (!req.user) throw new Error('User not authenticated');

  req.organizationId = req.params.id;
  await requirePermission(Permission.ORG_READ)(req, res, () => {});

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: req.params.id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          lastLoginAt: true,
        },
      },
      role: true,
    },
    orderBy: { joinedAt: 'desc' },
  });

  res.json({
    success: true,
    data: { members },
  });
});

/**
 * POST /api/v1/organizations/:id/members
 * Invite member to organization
 */
router.post(
  '/:id/members',
  authenticate,
  validateParams(uuidSchema),
  validateBody(inviteMemberSchema),
  async (req, res) => {
    if (!req.user) throw new Error('User not authenticated');

    req.organizationId = req.params.id;
    await requirePermission(Permission.ORG_MANAGE_MEMBERS)(req, res, () => {});

    // Find user by email
    const invitedUser = await prisma.user.findUnique({
      where: { email: req.body.email.toLowerCase() },
    });

    if (!invitedUser) {
      throw new NotFoundError('User not found with this email');
    }

    // Check if already a member
    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: req.params.id,
          userId: invitedUser.id,
        },
      },
    });

    if (existingMember) {
      throw new ConflictError('User is already a member');
    }

    // Add member
    const member = await prisma.organizationMember.create({
      data: {
        organizationId: req.params.id,
        userId: invitedUser.id,
        roleId: req.body.roleId,
        invitedBy: req.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        role: true,
      },
    });

    // Audit log
    await auditService.logSuccess({
      organizationId: req.params.id,
      userId: req.user.id,
      action: 'member.invite',
      resource: 'organization_member',
      resourceId: member.id,
      metadata: { invitedUserId: invitedUser.id, roleId: req.body.roleId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({
      success: true,
      data: { member },
    });
  }
);

/**
 * DELETE /api/v1/organizations/:id/members/:memberId
 * Remove member from organization
 */
router.delete(
  '/:id/members/:memberId',
  authenticate,
  async (req, res) => {
    if (!req.user) throw new Error('User not authenticated');

    req.organizationId = req.params.id;
    await requirePermission(Permission.ORG_MANAGE_MEMBERS)(req, res, () => {});

    await prisma.organizationMember.delete({
      where: {
        id: req.params.memberId,
        organizationId: req.params.id,
      },
    });

    // Audit log
    await auditService.logSuccess({
      organizationId: req.params.id,
      userId: req.user.id,
      action: 'member.remove',
      resource: 'organization_member',
      resourceId: req.params.memberId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      message: 'Member removed successfully',
    });
  }
);

export default router;
