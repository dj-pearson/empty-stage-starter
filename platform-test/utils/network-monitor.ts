/**
 * Network Monitor
 *
 * Tracks API requests during tests for:
 * - Detecting failed API calls
 * - Validating request/response patterns
 * - Performance monitoring
 */

import { Page, Request, Response } from 'playwright';

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  timestamp: number;
}

export interface CapturedResponse {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  timing: number;
  timestamp: number;
}

export interface NetworkError {
  url: string;
  method: string;
  status: number;
  statusText: string;
  timestamp: number;
}

/**
 * Network Monitor class
 */
export class NetworkMonitor {
  private page: Page;
  private requests: CapturedRequest[] = [];
  private responses: CapturedResponse[] = [];
  private errors: NetworkError[] = [];
  private isRecording = false;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Start recording network activity
   */
  start(): void {
    if (this.isRecording) return;

    this.requests = [];
    this.responses = [];
    this.errors = [];
    this.isRecording = true;

    this.page.on('request', this.handleRequest.bind(this));
    this.page.on('response', this.handleResponse.bind(this));
    this.page.on('requestfailed', this.handleRequestFailed.bind(this));
  }

  /**
   * Stop recording network activity
   */
  stop(): void {
    this.isRecording = false;
    this.page.removeListener('request', this.handleRequest.bind(this));
    this.page.removeListener('response', this.handleResponse.bind(this));
    this.page.removeListener('requestfailed', this.handleRequestFailed.bind(this));
  }

  /**
   * Handle request event
   */
  private handleRequest(request: Request): void {
    if (!this.shouldCapture(request.url())) return;

    this.requests.push({
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      postData: request.postData() || undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle response event
   */
  private handleResponse(response: Response): void {
    if (!this.shouldCapture(response.url())) return;

    const request = response.request();
    const timing = response.request().timing();

    this.responses.push({
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      headers: response.headers(),
      timing: timing.responseEnd - timing.requestStart,
      timestamp: Date.now(),
    });

    // Track errors (4xx, 5xx)
    if (response.status() >= 400) {
      this.errors.push({
        url: response.url(),
        method: request.method(),
        status: response.status(),
        statusText: response.statusText(),
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle failed request event
   */
  private handleRequestFailed(request: Request): void {
    if (!this.shouldCapture(request.url())) return;

    this.errors.push({
      url: request.url(),
      method: request.method(),
      status: 0,
      statusText: request.failure()?.errorText || 'Request failed',
      timestamp: Date.now(),
    });
  }

  /**
   * Check if URL should be captured
   */
  private shouldCapture(url: string): boolean {
    // Skip static assets
    const skipPatterns = [
      /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico)(\?.*)?$/i,
      /^data:/,
      /google-analytics/,
      /googletagmanager/,
      /sentry/,
    ];

    return !skipPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Get all captured requests
   */
  getRequests(): CapturedRequest[] {
    return [...this.requests];
  }

  /**
   * Get all captured responses
   */
  getResponses(): CapturedResponse[] {
    return [...this.responses];
  }

  /**
   * Get all errors
   */
  getErrors(): NetworkError[] {
    return [...this.errors];
  }

  /**
   * Get requests matching a pattern
   */
  getRequestsMatching(pattern: RegExp | string): CapturedRequest[] {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return this.requests.filter(r => regex.test(r.url));
  }

  /**
   * Get responses matching a pattern
   */
  getResponsesMatching(pattern: RegExp | string): CapturedResponse[] {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return this.responses.filter(r => regex.test(r.url));
  }

  /**
   * Wait for a specific API call
   */
  async waitForRequest(pattern: RegExp | string, timeout = 10000): Promise<CapturedRequest | null> {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const match = this.requests.find(r => regex.test(r.url));
      if (match) return match;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return null;
  }

  /**
   * Assert no API errors occurred
   */
  assertNoErrors(): void {
    if (this.errors.length > 0) {
      const errorSummary = this.errors
        .map(e => `${e.method} ${e.url} - ${e.status} ${e.statusText}`)
        .join('\n');
      throw new Error(`API errors detected:\n${errorSummary}`);
    }
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    totalRequests: number;
    avgResponseTime: number;
    slowestRequest: CapturedResponse | null;
    errorRate: number;
  } {
    const totalRequests = this.responses.length;
    const avgResponseTime = totalRequests > 0
      ? this.responses.reduce((sum, r) => sum + r.timing, 0) / totalRequests
      : 0;
    const slowestRequest = this.responses.length > 0
      ? this.responses.reduce((slowest, r) => r.timing > slowest.timing ? r : slowest)
      : null;
    const errorRate = totalRequests > 0
      ? this.errors.length / totalRequests
      : 0;

    return { totalRequests, avgResponseTime, slowestRequest, errorRate };
  }

  /**
   * Clear all captured data
   */
  clear(): void {
    this.requests = [];
    this.responses = [];
    this.errors = [];
  }
}

export default NetworkMonitor;
