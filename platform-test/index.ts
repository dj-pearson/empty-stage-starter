#!/usr/bin/env node
/**
 * Platform Test CLI
 *
 * Universal testing framework for comprehensive platform testing.
 *
 * Commands:
 *   discover  - Crawl application and discover all testable elements
 *   generate  - Generate test scripts from discovery report
 *   run       - Execute generated tests
 *   full      - Run full pipeline (discover → generate → run)
 *
 * Usage:
 *   npx ts-node platform-test discover
 *   npx ts-node platform-test generate
 *   npx ts-node platform-test run
 *   npx ts-node platform-test full
 */

import * as path from 'path';
import * as fs from 'fs';
import { ElementFinder } from './discovery/element-finder';
import { TestGenerator } from './generators/test-generator';
import { TestRunner } from './runners/test-runner';
import { config, loadConfig } from './config';

// ANSI colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function printBanner(): void {
  console.log('');
  log('╔══════════════════════════════════════════════════════════╗', colors.cyan);
  log('║                                                          ║', colors.cyan);
  log('║     🧪 PLATFORM TEST - Universal Testing Framework       ║', colors.cyan);
  log('║                                                          ║', colors.cyan);
  log('╚══════════════════════════════════════════════════════════╝', colors.cyan);
  console.log('');
}

function printHelp(): void {
  printBanner();

  console.log(`${colors.bright}Usage:${colors.reset}`);
  console.log('  npx ts-node platform-test <command> [options]');
  console.log('');

  console.log(`${colors.bright}Commands:${colors.reset}`);
  console.log(`  ${colors.green}discover${colors.reset}   Crawl application and discover all testable elements`);
  console.log(`  ${colors.green}generate${colors.reset}   Generate test scripts from discovery report`);
  console.log(`  ${colors.green}run${colors.reset}        Execute generated tests`);
  console.log(`  ${colors.green}full${colors.reset}       Run full pipeline (discover → generate → run)`);
  console.log(`  ${colors.green}help${colors.reset}       Show this help message`);
  console.log('');

  console.log(`${colors.bright}Options:${colors.reset}`);
  console.log('  --config <path>    Path to custom config file');
  console.log('  --report <path>    Path to discovery report (for generate command)');
  console.log('  --headless         Run browser in headless mode (default: true)');
  console.log('  --no-headless      Run browser with visible window');
  console.log('  --slow             Slow down actions for debugging');
  console.log('');

  console.log(`${colors.bright}Examples:${colors.reset}`);
  console.log('  # Run element discovery');
  console.log('  npx ts-node platform-test discover');
  console.log('');
  console.log('  # Generate tests from latest discovery');
  console.log('  npx ts-node platform-test generate');
  console.log('');
  console.log('  # Run all generated tests');
  console.log('  npx ts-node platform-test run');
  console.log('');
  console.log('  # Full pipeline with visible browser');
  console.log('  npx ts-node platform-test full --no-headless');
  console.log('');

  console.log(`${colors.bright}Configuration:${colors.reset}`);
  console.log('  Copy .env.example to .env and configure your settings.');
  console.log('  See README.md for detailed configuration options.');
  console.log('');
}

async function runDiscover(options: Record<string, any>): Promise<void> {
  log('\n📡 Starting Element Discovery...', colors.cyan);
  log(`Target: ${config.baseUrl}`, colors.dim);

  const finder = new ElementFinder({
    browser: {
      ...config.browser,
      headless: options.headless ?? config.browser.headless,
      slowMo: options.slow ? 100 : config.browser.slowMo,
    },
  });

  const report = await finder.discover();

  log('\n✅ Discovery Complete!', colors.green);
  log(`   Pages: ${report.pages.length}`, colors.dim);
  log(`   Forms: ${report.totalElements.forms}`, colors.dim);
  log(`   Buttons: ${report.totalElements.buttons}`, colors.dim);
  log(`   Links: ${report.totalElements.links}`, colors.dim);
  log(`   Inputs: ${report.totalElements.inputs}`, colors.dim);
  log(`   Suggested Flows: ${report.suggestedFlows.length}`, colors.dim);

  if (report.errors.length > 0) {
    log(`\n⚠️  Warnings: ${report.errors.length}`, colors.yellow);
  }
}

async function runGenerate(options: Record<string, any>): Promise<void> {
  log('\n⚙️  Generating Tests...', colors.cyan);

  const generator = new TestGenerator();

  if (options.report) {
    await generator.loadReport(options.report);
  } else {
    await generator.loadReport();
  }

  const tests = await generator.generateAll();

  log('\n✅ Generation Complete!', colors.green);
  log(`   Tests Generated: ${tests.length}`, colors.dim);

  // Group by type
  const formTests = tests.filter(t => t.id.includes('form'));
  const buttonTests = tests.filter(t => t.id.includes('button'));
  const navTests = tests.filter(t => t.id.includes('navigation'));
  const flowTests = tests.filter(t => t.id.includes('flow'));
  const smokeTests = tests.filter(t => t.id.includes('smoke'));

  log(`   - Form Tests: ${formTests.length}`, colors.dim);
  log(`   - Button Tests: ${buttonTests.length}`, colors.dim);
  log(`   - Navigation Tests: ${navTests.length}`, colors.dim);
  log(`   - Flow Tests: ${flowTests.length}`, colors.dim);
  log(`   - Smoke Tests: ${smokeTests.length}`, colors.dim);
}

async function runTests(options: Record<string, any>): Promise<void> {
  log('\n🚀 Running Tests...', colors.cyan);

  const runner = new TestRunner({
    browser: {
      ...config.browser,
      headless: options.headless ?? config.browser.headless,
      slowMo: options.slow ? 100 : config.browser.slowMo,
    },
  });

  const summary = await runner.runAll();

  if (summary.summary.failed > 0) {
    log(`\n❌ ${summary.summary.failed} test(s) failed`, colors.red);
    process.exitCode = 1;
  } else {
    log('\n✅ All tests passed!', colors.green);
  }
}

async function runFull(options: Record<string, any>): Promise<void> {
  printBanner();
  log('Running Full Test Pipeline...', colors.bright);

  // Step 1: Discover
  log('\n' + '='.repeat(50), colors.dim);
  log('STEP 1/3: Element Discovery', colors.bright);
  log('='.repeat(50), colors.dim);
  await runDiscover(options);

  // Step 2: Generate
  log('\n' + '='.repeat(50), colors.dim);
  log('STEP 2/3: Test Generation', colors.bright);
  log('='.repeat(50), colors.dim);
  await runGenerate(options);

  // Step 3: Run
  log('\n' + '='.repeat(50), colors.dim);
  log('STEP 3/3: Test Execution', colors.bright);
  log('='.repeat(50), colors.dim);
  await runTests(options);
}

function parseArgs(args: string[]): { command: string; options: Record<string, any> } {
  const command = args[0] || 'help';
  const options: Record<string, any> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--config':
        options.config = args[++i];
        break;
      case '--report':
        options.report = args[++i];
        break;
      case '--headless':
        options.headless = true;
        break;
      case '--no-headless':
        options.headless = false;
        break;
      case '--slow':
        options.slow = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.warn(`Unknown option: ${arg}`);
        }
    }
  }

  return { command, options };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, options } = parseArgs(args);

  if (options.help) {
    printHelp();
    return;
  }

  // Ensure output directories exist
  await fs.promises.mkdir(path.join(__dirname, 'reports'), { recursive: true });
  await fs.promises.mkdir(path.join(__dirname, 'reports', 'screenshots'), { recursive: true });
  await fs.promises.mkdir(path.join(__dirname, 'generated'), { recursive: true });
  await fs.promises.mkdir(path.join(__dirname, 'fixtures'), { recursive: true });

  // Create test fixture file if not exists
  const fixtureFile = path.join(__dirname, 'fixtures', 'test-file.txt');
  if (!fs.existsSync(fixtureFile)) {
    await fs.promises.writeFile(fixtureFile, 'This is a test file for file upload testing.');
  }

  try {
    switch (command) {
      case 'discover':
        await runDiscover(options);
        break;

      case 'generate':
        await runGenerate(options);
        break;

      case 'run':
        await runTests(options);
        break;

      case 'full':
        await runFull(options);
        break;

      case 'help':
      default:
        printHelp();
        break;
    }
  } catch (error) {
    log(`\n❌ Error: ${error}`, colors.red);
    console.error(error);
    process.exit(1);
  }
}

// Run CLI
main().catch(console.error);

// Export for programmatic use
export { ElementFinder, TestGenerator, TestRunner, config, loadConfig };
