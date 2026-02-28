/**
 * Health Check Edge Function
 *
 * Returns the health status of the API and database.
 * Used by monitoring systems to verify service availability.
 *
 * GET /health-check
 *
 * Response (200 healthy):
 * {
 *   "status": "healthy",
 *   "timestamp": "2026-02-12T...",
 *   "version": "1.0.0",
 *   "database": { "connected": true, "latency_ms": 42 }
 * }
 *
 * Response (503 degraded):
 * {
 *   "status": "degraded",
 *   "timestamp": "2026-02-12T...",
 *   "version": "1.0.0",
 *   "database": { "connected": false, "error": "..." }
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';

const VERSION = '1.0.0';
const DB_TIMEOUT_MS = 5000;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight(req);
  }

  const timestamp = new Date().toISOString();

  let dbConnected = false;
  let dbLatencyMs: number | undefined;
  let dbError: string | undefined;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DB_TIMEOUT_MS);

    const dbStart = performance.now();

    try {
      const { error } = await Promise.race([
        supabaseClient.from('kids').select('id').limit(1),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error('Database query timed out'))
          );
        }),
      ]);

      clearTimeout(timeout);
      dbLatencyMs = Math.round(performance.now() - dbStart);

      if (error) {
        console.error('Database health check error:', error.message);
        dbError = 'Database query failed';
      } else {
        dbConnected = true;
      }
    } catch (err) {
      clearTimeout(timeout);
      dbLatencyMs = Math.round(performance.now() - dbStart);
      console.error('Database health check query error:', err);
      dbError = 'Database query failed';
    }
  } catch (err) {
    console.error('Database client initialization error:', err);
    dbError = 'Failed to initialize database client';
  }

  const status = dbConnected ? 'healthy' : 'degraded';
  const httpStatus = dbConnected ? 200 : 503;

  const database: Record<string, unknown> = { connected: dbConnected };
  if (dbLatencyMs !== undefined) {
    database.latency_ms = dbLatencyMs;
  }
  if (dbError) {
    database.error = dbError;
  }

  const responseData = {
    status,
    timestamp,
    version: VERSION,
    database,
  };

  return new Response(JSON.stringify(responseData, null, 2), {
    status: httpStatus,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
});
