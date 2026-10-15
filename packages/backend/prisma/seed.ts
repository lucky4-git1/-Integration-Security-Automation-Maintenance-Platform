import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ROLE_PERMISSIONS } from '../src/services/authorization.service.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create system roles
  console.log('Creating system roles...');

  const roles = [
    {
      slug: 'owner',
      name: 'Owner',
      description: 'Full access to organization including billing and deletion',
      permissions: JSON.stringify(ROLE_PERMISSIONS.owner),
      isSystem: true,
    },
    {
      slug: 'admin',
      name: 'Administrator',
      description: 'Full operational access to manage organization resources',
      permissions: JSON.stringify(ROLE_PERMISSIONS.admin),
      isSystem: true,
    },
    {
      slug: 'operator',
      name: 'Operator',
      description: 'Execute automations and manage incidents',
      permissions: JSON.stringify(ROLE_PERMISSIONS.operator),
      isSystem: true,
    },
    {
      slug: 'security_auditor',
      name: 'Security Auditor',
      description: 'Read-only access to security findings and audit logs',
      permissions: JSON.stringify(ROLE_PERMISSIONS.security_auditor),
      isSystem: true,
    },
    {
      slug: 'viewer',
      name: 'Viewer',
      description: 'Read-only access to organization resources',
      permissions: JSON.stringify(ROLE_PERMISSIONS.viewer),
      isSystem: true,
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { slug: role.slug },
      update: role,
      create: role,
    });
  }

  console.log('✅ System roles created');

  console.log('🎉 Seeding completed successfully');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
