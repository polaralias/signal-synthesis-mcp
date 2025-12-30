import { FinancialServer } from './server';

const server = new FinancialServer();
server.start().catch((error) => {
  console.error('Fatal error running server:', error);
  process.exit(1);
});
