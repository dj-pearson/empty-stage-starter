/**
 * Global Setup for Edge Functions Tests
 *
 * This script runs before all tests to set up the test environment.
 */

import * as fs from 'fs';
import * as path from 'path';
import { FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig): Promise<void> {
  console.log('\n🔧 Setting up Edge Functions test environment...\n');

  // Load environment variables from .env if exists
  loadEnvFile();

  // Verify required environment variables
  const warnings = verifyEnvironment();
  if (warnings.length > 0) {
    console.log('⚠️  Environment warnings:');
    for (const warning of warnings) {
      console.log(`   - ${warning}`);
    }
    console.log('');
  }

  // Create results directory
  const resultsDir = path.join(__dirname, '..', 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  // Check function endpoint health
  await checkFunctionsHealth();

  console.log('✅ Setup complete!\n');
}

function loadEnvFile(): void {
  const envPath = path.join(process.cwd(), '.env');

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

function verifyEnvironment(): string[] {
  const warnings: string[] = [];

  // Required variables
  const required = {
    VITE_FUNCTIONS_URL: 'Edge Functions base URL',
    VITE_SUPABASE_ANON_KEY: 'Supabase anonymous key',
  };

  // Optional but recommended
  const optional = {
    VITE_SUPABASE_URL: 'Supabase project URL',
    SUPABASE_SERVICE_ROLE_KEY: 'Service role key (for admin functions)',
    TEST_USER_EMAIL: 'Test user email',
    TEST_USER_PASSWORD: 'Test user password',
    CRON_SECRET: 'Cron job secret',
  };

  for (const [key, description] of Object.entries(required)) {
    if (!process.env[key]) {
      warnings.push(`Missing required: ${key} (${description})`);
    }
  }

  for (const [key, description] of Object.entries(optional)) {
    if (!process.env[key]) {
      warnings.push(`Missing optional: ${key} (${description}) - some tests may be skipped`);
    }
  }

  return warnings;
}

async function checkFunctionsHealth(): Promise<void> {
  const baseUrl = process.env.VITE_FUNCTIONS_URL || 'https://functions.tryeatpal.com';
  const healthUrl = `${baseUrl}/functions/v1/_health`;

  try {
    console.log(`🩺 Checking functions health at ${healthUrl}...`);

    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const body = await response.json();
      if (body.status === 'healthy') {
        console.log('   ✓ Edge Functions are healthy');
      } else {
        console.log(`   ⚠️  Health check returned: ${body.status}`);
      }
    } else {
      console.log(`   ⚠️  Health check returned status: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ⚠️  Could not reach health endpoint: ${error}`);
    console.log('   Note: Some tests may fail if functions are not accessible');
  }
}

export default globalSetup;
