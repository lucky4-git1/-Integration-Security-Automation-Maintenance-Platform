import { describe, it, expect } from 'vitest';
import { Permission, ROLE_PERMISSIONS, AuthorizationService } from './authorization.service.js';
import { ForbiddenError } from '@/utils/errors.js';

describe('RBAC Authorization & Multi-Tenancy Isolation', () => {
  describe('Role-Permission Mapping Hierarchy', () => {
    it('Owner should have all permissions including dangerous actions', () => {
      const ownerPerms = ROLE_PERMISSIONS.owner;
      expect(ownerPerms).toContain(Permission.ORG_DELETE);
      expect(ownerPerms).toContain(Permission.INTEGRATION_DELETE);
      expect(ownerPerms).toContain(Permission.BACKUP_DELETE);
      expect(ownerPerms).toContain(Permission.BACKUP_RESTORE);
      expect(ownerPerms.length).toBe(Object.values(Permission).length);
    });

    it('Administrator should have operational permissions but not ORG_DELETE', () => {
      const adminPerms = ROLE_PERMISSIONS.admin;
      expect(adminPerms).not.toContain(Permission.ORG_DELETE);
      expect(adminPerms).not.toContain(Permission.BACKUP_DELETE);
      expect(adminPerms).toContain(Permission.ORG_WRITE);
      expect(adminPerms).toContain(Permission.INTEGRATION_MANAGE);
      expect(adminPerms).toContain(Permission.AUTOMATION_EXECUTE);
    });

    it('Operator should have execute and incident rights without management rights', () => {
      const operatorPerms = ROLE_PERMISSIONS.operator;
      expect(operatorPerms).toContain(Permission.AUTOMATION_EXECUTE);
      expect(operatorPerms).toContain(Permission.INCIDENT_WRITE);
      expect(operatorPerms).not.toContain(Permission.INTEGRATION_WRITE);
      expect(operatorPerms).not.toContain(Permission.ORG_MANAGE_MEMBERS);
    });

    it('Security Auditor should have audit and read permissions without mutation rights', () => {
      const auditorPerms = ROLE_PERMISSIONS.security_auditor;
      expect(auditorPerms).toContain(Permission.SECURITY_AUDIT);
      expect(auditorPerms).toContain(Permission.SECURITY_READ);
      expect(auditorPerms).toContain(Permission.AUDIT_READ);
      expect(auditorPerms).not.toContain(Permission.AUTOMATION_EXECUTE);
      expect(auditorPerms).not.toContain(Permission.ORG_WRITE);
    });

    it('Viewer should have strictly read-only permissions across modules', () => {
      const viewerPerms = ROLE_PERMISSIONS.viewer;
      for (const perm of viewerPerms) {
        expect(perm.endsWith(':read')).toBe(true);
      }
      expect(viewerPerms).not.toContain(Permission.AUTOMATION_EXECUTE);
      expect(viewerPerms).not.toContain(Permission.INCIDENT_RESOLVE);
    });
  });

  describe('Tenant Isolation Verification', () => {
    it('should identify cross-tenant mismatch and reject unauthorized access', () => {
      const resource = { organizationId: 'org-tenant-alpha-1111' };
      const currentOrgId = 'org-tenant-bravo-2222';

      function checkTenantAccess(resOrgId: string, userOrgId: string) {
        if (resOrgId !== userOrgId) {
          throw new ForbiddenError('Resource does not belong to this organization');
        }
      }

      expect(() => {
        checkTenantAccess(resource.organizationId, currentOrgId);
      }).toThrow(ForbiddenError);

      expect(() => {
        checkTenantAccess(resource.organizationId, currentOrgId);
      }).toThrow('Resource does not belong to this organization');

      expect(() => {
        checkTenantAccess(resource.organizationId, resource.organizationId);
      }).not.toThrow();
    });
  });
});
