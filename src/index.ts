#!/usr/bin/env node

import { Command } from 'commander';
import { version } from '../package.json';
import { createApp } from './app';

// Setup commander for CLI functionality
const program = new Command();
program
  .version(version)
  .description('Initia2Aptos Bridge API')
  .option('-p, --port <number>', 'Port to run the server on', '3000')
  .option('-c, --chain-id <string>', 'Chain ID for Initia', 'echelon-1')
  .option('-e, --endpoint <url>', 'indexer endpoint', 'https://archival-rest-echelon-1.anvil.asia-southeast.initia.xyz')
  .option('--cache-enabled <boolean>', 'Enable API response caching', 'true')
  .option('--cache-duration <string>', 'Cache duration in plain English (e.g. "5 minutes", "1 hour")', '5 minutes');

program.action(() => {
  const options = program.opts();
  const PORT = process.env.PORT || options.port;

  // Create app with CLI options
  const app = createApp({
    port: options.port,
    chainId: options.chainId,
    endpoint: options.endpoint,
    cacheEnabled: options.cacheEnabled === 'true',
    cacheDuration: options.cacheDuration
  });

  // Start the server
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}, version ${version}`);
  });
});

program.parse();
