#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres",
    },
  },
});

const command = process.argv[2];
const subCommand = process.argv[3];
const arg1 = process.argv[4];

function maskId(value) {
  if (!value || value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

async function main() {
  if (command === 'connections') {
    if (subCommand === 'list') {
      const connections = await prisma.connection.findMany();
      console.table(connections.map(c => ({ id: c.id, name: c.name, created: c.createdAt })));
    } else if (subCommand === 'delete') {
      if (!arg1) {
        console.error('ID required');
        process.exit(1);
      }
      await prisma.connection.delete({ where: { id: arg1 } });
      console.log(`Connection ${arg1} deleted`);
    }
  } else if (command === 'api-keys') {
    if (subCommand === 'list') {
      const keys = await prisma.apiKey.findMany({ include: { userConfig: true } });
      console.table(keys.map(k => ({
        id: maskId(k.id),
        created: k.createdAt,
        revoked: k.revokedAt,
        configId: k.userConfigId
      })));
    } else if (subCommand === 'revoke') {
       if (!arg1) {
        console.error('ID required');
        process.exit(1);
      }
      await prisma.apiKey.update({ where: { id: arg1 }, data: { revokedAt: new Date() } });
      console.log(`API Key ${arg1} revoked`);
    }
  } else {
    console.log('Usage:');
    console.log('  npm run cli connections list');
    console.log('  npm run cli connections delete <id>');
    console.log('  npm run cli api-keys list');
    console.log('  npm run cli api-keys revoke <id>');
  }
}

main()
  .catch(e => {
    // Suppress connection errors for now if DB is unreachable in this environment
    if (e.message && e.message.includes('P1001')) {
       console.log("Database unreachable. This is expected in the build environment.");
    } else {
       console.error(e);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
