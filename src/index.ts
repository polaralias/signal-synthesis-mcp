import { SignalSynthesisServer } from './server';

const server = new SignalSynthesisServer();
server.start().catch((error) => {
  console.error('Fatal error running server:', error);
  process.exit(1);
});
