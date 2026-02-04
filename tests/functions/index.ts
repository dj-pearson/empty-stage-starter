/**
 * Edge Functions Test Suite
 *
 * Main entry point for discovering, generating, and running
 * tests for all Supabase Edge Functions.
 *
 * Usage:
 *   npx ts-node tests/functions/index.ts [command] [options]
 *
 * Commands:
 *   discover    - Discover all Edge Functions
 *   generate    - Generate tests from discovery results
 *   run         - Execute generated tests
 *   full        - Run complete pipeline (default)
 *
 * Options:
 *   --verbose, -v      Show detailed output
 *   --headed           Run browser tests in headed mode
 *   --no-parallel      Run tests sequentially
 *   --category <name>  Filter by category
 *   --function <name>  Filter by function name
 *   --reporter <type>  Report format: html, list, json, junit
 */

import * as path from 'path';
import * as fs from 'fs';

// Import components
import FunctionDiscovery from './discovery/function-discovery';
import TestGenerator from './generator/test-generator';
import FunctionTestRunner from './runner/function-test-runner';

// Export all components for programmatic use
export { FunctionDiscovery, TestGenerator, FunctionTestRunner };
export * from './config/functions-test.config';

// Main CLI handler
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   EatPal Edge Functions Test Suite       ║');
  console.log('╚══════════════════════════════════════════╝\n');

  switch (command) {
    case 'discover':
      await runDiscovery();
      break;

    case 'generate':
      await runGeneration();
      break;

    case 'run':
      await runTests(args.slice(1));
      break;

    case 'full':
      await runFullPipeline(args.slice(1));
      break;

    case 'status':
      await showStatus();
      break;

    case 'help':
    case '--help':
    case '-h':
    default:
      showHelp();
      break;
  }
}

async function runDiscovery(): Promise<void> {
  console.log('📡 Discovering Edge Functions...\n');

  const discovery = new FunctionDiscovery();
  const result = await discovery.discover();

  discovery.printSummary(result);
  await discovery.saveResults(result);

  console.log('✅ Discovery complete!\n');
}

async function runGeneration(): Promise<void> {
  console.log('🔧 Generating Tests...\n');

  // Load discovery results
  const discoveryFile = path.join(
    process.cwd(),
    'tests',
    'functions',
    'discovery',
    'discovered-functions.json'
  );

  if (!fs.existsSync(discoveryFile)) {
    console.log('⚠️  No discovery results found. Running discovery first...\n');
    await runDiscovery();
  }

  const discoveryResult = JSON.parse(fs.readFileSync(discoveryFile, 'utf-8'));
  const generator = new TestGenerator();
  const result = await generator.generateTests(discoveryResult.functions);

  generator.printSummary(result);

  console.log('✅ Generation complete!\n');
}

async function runTests(args: string[]): Promise<void> {
  console.log('🧪 Running Tests...\n');

  const runner = new FunctionTestRunner();

  const options = {
    mode: 'run' as const,
    parallel: !args.includes('--no-parallel'),
    headless: !args.includes('--headed'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    reporter: getArgValue(args, '--reporter') as 'html' | 'list' | 'json' | 'junit' || 'html',
    categories: getArgValues(args, '--category'),
    functions: getArgValues(args, '--function'),
  };

  await runner.run(options);
}

async function runFullPipeline(args: string[]): Promise<void> {
  console.log('🚀 Running Full Test Pipeline...\n');

  const runner = new FunctionTestRunner();

  const options = {
    mode: 'full' as const,
    parallel: !args.includes('--no-parallel'),
    headless: !args.includes('--headed'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    reporter: getArgValue(args, '--reporter') as 'html' | 'list' | 'json' | 'junit' || 'html',
    categories: getArgValues(args, '--category'),
    functions: getArgValues(args, '--function'),
  };

  await runner.run(options);
}

async function showStatus(): Promise<void> {
  console.log('📊 Test Suite Status\n');

  // Check discovery results
  const discoveryFile = path.join(
    process.cwd(),
    'tests',
    'functions',
    'discovery',
    'discovered-functions.json'
  );

  if (fs.existsSync(discoveryFile)) {
    const discovery = JSON.parse(fs.readFileSync(discoveryFile, 'utf-8'));
    console.log(`Functions Discovered: ${discovery.totalFunctions}`);
    console.log(`Last Discovery: ${discovery.discoveryTimestamp}`);
    console.log('\nCategories:');
    for (const [cat, count] of Object.entries(discovery.categories)) {
      if ((count as number) > 0) {
        console.log(`  ${cat}: ${count}`);
      }
    }
  } else {
    console.log('No discovery results found. Run "discover" first.');
  }

  // Check generated tests
  const generatedDir = path.join(process.cwd(), 'tests', 'functions', 'generated');
  if (fs.existsSync(generatedDir)) {
    const files = fs.readdirSync(generatedDir).filter(f => f.endsWith('.spec.ts'));
    console.log(`\nGenerated Test Files: ${files.length}`);
    for (const file of files) {
      console.log(`  - ${file}`);
    }
  } else {
    console.log('\nNo generated tests found. Run "generate" first.');
  }

  // Check latest results
  const resultsFile = path.join(process.cwd(), 'tests', 'functions', 'results', 'latest.json');
  if (fs.existsSync(resultsFile)) {
    const results = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
    console.log(`\nLatest Run: ${results.timestamp}`);
    if (results.execution) {
      console.log(`  Passed: ${results.execution.passed}`);
      console.log(`  Failed: ${results.execution.failed}`);
      console.log(`  Skipped: ${results.execution.skipped}`);
    }
  }

  console.log('');
}

function showHelp(): void {
  console.log(`
Usage: npx ts-node tests/functions/index.ts [command] [options]

Commands:
  discover    Discover all Edge Functions in the project
  generate    Generate Playwright tests from discovery results
  run         Execute the generated tests
  full        Run complete pipeline: discover → generate → run (default)
  status      Show current test suite status
  help        Show this help message

Options:
  --verbose, -v       Show detailed output
  --headed            Run browser tests in headed mode
  --no-parallel       Run tests sequentially
  --category <name>   Filter by category (can specify multiple)
  --function <name>   Filter by function name (can specify multiple)
  --reporter <type>   Report format: html, list, json, junit

Categories:
  core, user-management, barcode, meal-planning, weekly-reports,
  blog, email, payment, seo, analytics, ai, delivery, notifications, misc

Examples:
  npx ts-node tests/functions/index.ts discover
  npx ts-node tests/functions/index.ts full --verbose
  npx ts-node tests/functions/index.ts run --category core --category payment
  npx ts-node tests/functions/index.ts run --function lookup-barcode --headed

Environment Variables:
  VITE_FUNCTIONS_URL        Edge Functions base URL
  VITE_SUPABASE_URL         Supabase project URL
  VITE_SUPABASE_ANON_KEY    Supabase anonymous key
  SUPABASE_SERVICE_ROLE_KEY Service role key (for admin functions)
  TEST_USER_EMAIL           Test user email for authentication
  TEST_USER_PASSWORD        Test user password
  CRON_SECRET               Secret for cron job functions
`);
}

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

function getArgValues(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) {
      values.push(args[++i]);
    }
  }
  return values;
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export default main;
