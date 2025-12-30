import { Router } from '../routing/router';
import { planAndRun } from '../tools/orchestrator';

// Load env vars
import 'dotenv/config';

async function main() {
  console.log('Initializing Router...');
  const router = new Router();

  console.log('\n--- Running Swing Trade Pipeline ---');
  try {
    const results = await planAndRun(router, 'swing');
    console.log('Results:', JSON.stringify(results, null, 2));
  } catch (error) {
    console.error('Error running pipeline:', error);
  }

  console.log('\n--- Running Day Trade Pipeline ---');
  try {
    const results = await planAndRun(router, 'day_trade');
    console.log('Results:', JSON.stringify(results, null, 2));
  } catch (error) {
    console.error('Error running pipeline:', error);
  }
}

main().catch(console.error);
