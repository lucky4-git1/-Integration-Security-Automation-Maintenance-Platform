import { prisma } from '@/config/database.js';
import { ForbiddenError, NotFoundError } from '@/utils/errors.js';
import type { Role } from '@prisma/client';

export enum Permission {
  // Organization
  ORG_READ = 'org:read',
  ORG_WRITE = 'org:write',
  ORG_DELETE = 'org:delete',
  ORG_MANAGE_MEMBERS = 'org:manage_members',

  // Integrations
  INTEGRATION_READ = 'integration:read',
  INTEGRATION_WRITE = 'integration:write',
  INTEGRATION_DELETE = 'integration:delete',
  INTEGRATION_MANAGE = 'integration:manage',

  // Automations
  AUTOMATION_READ = 'automation:read',
  AUTOMATION_WRITE = 'automation:write',
  AUTOMATION_DELETE = 'automation:delete',
  AUTOMATION_EXECUTE = 'automation:execute',

  // Incidents
  INCIDENT_READ = 'incident:read',
  INCIDENT_WRITE = 'incident:write',
  INCIDENT_RESOLVE = 'incident:resolve',

  // Backups
  BACKUP_READ = 'backup:read',
  BACKUP_CREATE = 'backup:create',
  BACKUP_DELETE = 'backup:delete',
  BACKUP_RESTORE = 'backup:restore',

  // Security
  SECURITY_READ = 'security:read',
  SECURITY_WRITE = 'security:write',
  SECURITY_AUDIT = 'security:audit',

  // Documentation
  DOC_READ = 'doc:read',
  DOC_WRITE = 'doc:write',
  DOC_DELETE = 'doc:delete',
  DOC_PUBLISH = 'doc:publish',

  // Performance
  PERFORMANCE_READ = 'performance:read',
  PERFORMANCE_WRITE = 'performance:write',

  // Audit
  AUDIT_READ = 'audit:read',
}

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: [
    Permission.ORG_READ,
    Permission.ORG_WRITE,
    Permission.ORG_DELETE,
    Permission.ORG_MANAGE_MEMBERS,
    Permission.INTEGRATION_READ,
    Permission.INTEGRATION_WRITE,
    Permission.INTEGRATION_DELETE,
    Permission.INTEGRATION_MANAGE,
    Permission.AUTOMATION_READ,
    Permission.AUTOMATION_WRITE,
    Permission.AUTOMATION_DELETE,
    Permission.AUTOMATION_EXECUTE,
    Permission.INCIDENT_READ,
    Permission.INCIDENT_WRITE,
    Permission.INCIDENT_RESOLVE,
    Permission.BACKUP_READ,
    Permission.BACKUP_CREATE,
    Permission.BACKUP_DELETE,
    Permission.BACKUP_RESTORE,
    Permission.SECURITY_READ,
    Permission.SECURITY_WRITE,
    Permission.SECURITY_AUDIT,
    Permission.DOC_READ,
    Permission.DOC_WRITE,
    Permission.DOC_DELETE,
    Permission.DOC_PUBLISH,
    Permission.PERFORMANCE_READ,
    Permission.PERFORMANCE_WRITE,
    Permission.AUDIT_READ,
  ],
  admin: [
    Permission.ORG_READ,
    Permission.ORG_WRITE,
    Permission.ORG_MANAGE_MEMBERS,
    Permission.INTEGRATION_READ,
    Permission.INTEGRATION_WRITE,
    Permission.INTEGRATION_MANAGE,
    Permission.AUTOMATION_READ,
    Permission.AUTOMATION_WRITE,
    Permission.AUTOMATION_EXECUTE,
    Permission.INCIDENT_READ,
    Permission.INCIDENT_WRITE,
    Permission.INCIDENT_RESOLVE,
    Permission.BACKUP_READ,
    Permission.BACKUP_CREATE,
    Permission.SECURITY_READ,
    Permission.SECURITY_WRITE,
    Permission.DOC_READ,
    Permission.DOC_WRITE,
    Permission.DOC_PUBLISH,
    Permission.PERFORMANCE_READ,
    Permission.AUDIT_READ,
  ],
  operator: [
    Permission.ORG_READ,
    Permission.INTEGRATION_READ,
    Permission.AUTOMATION_READ,
    Permission.AUTOMATION_EXECUTE,
    Permission.INCIDENT_READ,
    Permission.INCIDENT_WRITE,
    Permission.BACKUP_READ,
    Permission.DOC_READ,
    Permission.PERFORMANCE_READ,
  ],
  security_auditor: [
    Permission.ORG_READ,
    Permission.SECURITY_READ,
    Permission.SECURITY_AUDIT,
    Permission.AUDIT_READ,
    Permission.DOC_READ,
  ],
  viewer: [
    Permission.ORG_READ,
    Permission.INTEGRATION_READ,
    Permission.AUTOMATION_READ,
    Permission.INCIDENT_READ,
    Permission.BACKUP_READ,
    Permission.SECURITY_READ,
    Permission.DOC_READ,
    Permission.PERFORMANCE_READ,
    Permission.AUDIT_READ,
  ],
};

export class AuthorizationService {
  /**
   * Check if user is member of organization
   */
  async isMemberOfOrganization(userId: string, organizationId: string): Promise<boolean> {
    const member = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
    });

    return member !== null;
  }

  /**
   * Get user's role in organization
   */
  async getUserRole(userId: string, organizationId: string): Promise<Role | null> {
    const member = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      include: {
        role: true,
      },
    });

    return member?.role ?? null;
  }

  /**
   * Get user permissions in organization
   */
  async getUserPermissions(userId: string, organizationId: string): Promise<Permission[]> {
    const role = await this.getUserRole(userId, organizationId);

    if (!role) {
      return [];
    }

    // Get base permissions for role
    const basePermissions = ROLE_PERMISSIONS[role.slug] || [];

    let rawPermissions: unknown = role.permissions;
    if (typeof rawPermissions === 'string') {
      try {
        rawPermissions = JSON.parse(rawPermissions);
      } catch {
        rawPermissions = [];
      }
    }

    const customPermissions = Array.isArray(rawPermissions)
      ? (rawPermissions as string[]).filter(
          (p): p is Permission => Object.values(Permission).includes(p as Permission)
        )
      : [];

    return [...new Set([...basePermissions, ...customPermissions])];
  }

  /**
   * Check if user has specific permission in organization
   */
  async hasPermission(
    userId: string,
    organizationId: string,
    permission: Permission
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, organizationId);
    return permissions.includes(permission);
  }

  /**
   * Check if user has any of the specified permissions
   */
  async hasAnyPermission(
    userId: string,
    organizationId: string,
    permissions: Permission[]
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, organizationId);
    return permissions.some((p) => userPermissions.includes(p));
  }

  /**
   * Check if user has all specified permissions
   */
  async hasAllPermissions(
    userId: string,
    organizationId: string,
    permissions: Permission[]
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, organizationId);
    return permissions.every((p) => userPermissions.includes(p));
  }

  /**
   * Require user to be member of organization
   */
  async requireMembership(userId: string, organizationId: string): Promise<void> {
    const isMember = await this.isMemberOfOrganization(userId, organizationId);

    if (!isMember) {
      throw new ForbiddenError('You are not a member of this organization');
    }
  }

  /**
   * Require user to have specific permission
   */
  async requirePermission(
    userId: string,
    organizationId: string,
    permission: Permission
  ): Promise<void> {
    const hasPermission = await this.hasPermission(userId, organizationId, permission);

    if (!hasPermission) {
      throw new ForbiddenError(`Missing required permission: ${permission}`);
    }
  }

  /**
   * Require user to have any of the specified permissions
   */
  async requireAnyPermission(
    userId: string,
    organizationId: string,
    permissions: Permission[]
  ): Promise<void> {
    const hasPermission = await this.hasAnyPermission(userId, organizationId, permissions);

    if (!hasPermission) {
      throw new ForbiddenError(`Missing required permissions: ${permissions.join(', ')}`);
    }
  }

  /**
   * Verify resource belongs to organization
   */
  async verifyResourceOrganization(
    resourceType: string,
    resourceId: string,
    organizationId: string
  ): Promise<void> {
    let resource: { organizationId: string } | null = null;

    switch (resourceType) {
      case 'integration':
        resource = await prisma.integration.findUnique({ where: { id: resourceId } });
        break;
      case 'automation':
        resource = await prisma.automation.findUnique({ where: { id: resourceId } });
        break;
      case 'incident':
        resource = await prisma.incident.findUnique({ where: { id: resourceId } });
        break;
      case 'backup':
        resource = await prisma.backupPolicy.findUnique({ where: { id: resourceId } });
        break;
      case 'document':
        resource = await prisma.document.findUnique({ where: { id: resourceId } });
        break;
      default:
        throw new Error(`Unknown resource type: ${resourceType}`);
    }

    if (!resource) {
      throw new NotFoundError(`${resourceType} not found`);
    }

    if (resource.organizationId !== organizationId) {
      throw new ForbiddenError('Resource does not belong to this organization');
    }
  }
}

export const authorizationService = new AuthorizationService();
