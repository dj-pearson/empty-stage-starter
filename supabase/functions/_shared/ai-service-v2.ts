/**
 * AI Service V2 - Centralized AI Configuration
 * 
 * This service loads configuration from Coolify Team Shared Variables
 * and provides unified AI model access across all platforms.
 * 
 * Environment Variables (Coolify Team Shared):
 * - AI_DEFAULT_PROVIDER: anthropic | openai | gemini
 * - DEFAULT_AI_MODEL: claude-sonnet-4-5-20250929
 * - LIGHTWEIGHT_AI_MODEL: claude-3-5-haiku-20241022
 * - CLAUDE_API_KEY: Anthropic API key
 * - OPENAI_GLOBAL_API: OpenAI API key (optional)
 * - AI_MAX_RETRIES: 3
 * - AI_TIMEOUT_MS: 30000
 * - AI_TEMPERATURE: 0.7
 * - AI_ENABLE_CACHING: true
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type AIProvider = 'claude' | 'openai' | 'gemini';
export type AITaskType = 'standard' | 'lightweight';

export interface AIConfig {
  defaultProvider: AIProvider;
  defaultModel: string;
  lightweightModel: string;
  claudeApiKey?: string;
  openaiApiKey?: string;
  maxRetries: number;
  timeoutMs: number;
  temperature: number;
  enableCaching: boolean;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class AIServiceV2 {
  private config: AIConfig;
  private supabase: any;

  constructor() {
    // Load configuration from environment variables (Coolify Team Shared)
    this.config = {
      defaultProvider: (Deno.env.get('AI_DEFAULT_PROVIDER') || 'anthropic') as AIProvider,
      defaultModel: Deno.env.get('DEFAULT_AI_MODEL') || 'claude-sonnet-4-5-20250929',
      lightweightModel: Deno.env.get('LIGHTWEIGHT_AI_MODEL') || 'claude-3-5-haiku-20241022',
      claudeApiKey: Deno.env.get('CLAUDE_API_KEY'),
      openaiApiKey: Deno.env.get('OPENAI_GLOBAL_API'),
      maxRetries: parseInt(Deno.env.get('AI_MAX_RETRIES') || '3'),
      timeoutMs: parseInt(Deno.env.get('AI_TIMEOUT_MS') || '30000'),
      temperature: parseFloat(Deno.env.get('AI_TEMPERATURE') || '0.7'),
      enableCaching: Deno.env.get('AI_ENABLE_CACHING') !== 'false',
    };

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Generate content using AI
   * @param request AI request with messages
   * @param taskType 'standard' for complex tasks, 'lightweight' for simple/fast tasks
   */
  async generateContent(
    request: AIRequest,
    taskType: AITaskType = 'standard'
  ): Promise<AIResponse> {
    const modelToUse = request.model || 
      (taskType === 'lightweight' ? this.config.lightweightModel : this.config.defaultModel);
    
    console.log(`[AIServiceV2] Generating content with model: ${modelToUse} (task: ${taskType})`);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest(request, modelToUse);
        return response;
      } catch (error) {
        lastError = error as Error;
        console.error(`[AIServiceV2] Attempt ${attempt}/${this.config.maxRetries} failed:`, error);
        
        if (attempt < this.config.maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`AI request failed after ${this.config.maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Generate lightweight content (uses Haiku by default)
   * Optimized for simple, fast tasks like classification, extraction, short summaries
   */
  async generateLightweight(
    prompt: string,
    systemPrompt?: string,
    maxTokens: number = 500
  ): Promise<string> {
    const messages: AIMessage[] = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });

    const response = await this.generateContent(
      { messages, maxTokens },
      'lightweight'
    );

    return response.content;
  }

  /**
   * Generate simple content with a single prompt (uses standard model)
   */
  async generateSimpleContent(
    prompt: string,
    options?: { systemPrompt?: string; maxTokens?: number; taskType?: AITaskType }
  ): Promise<string> {
    const messages: AIMessage[] = [];
    
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });

    const response = await this.generateContent(
      { messages, maxTokens: options?.maxTokens },
      options?.taskType || 'standard'
    );

    return response.content;
  }

  /**
   * Make the actual API request based on provider
   */
  private async makeRequest(request: AIRequest, model: string): Promise<AIResponse> {
    const provider = this.detectProvider(model);

    switch (provider) {
      case 'claude':
        return await this.makeClaudeRequest(request, model);
      case 'openai':
        return await this.makeOpenAIRequest(request, model);
      case 'gemini':
        return await this.makeGeminiRequest(request, model);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Detect provider from model name
   */
  private detectProvider(model: string): AIProvider {
    if (model.startsWith('claude')) return 'claude';
    if (model.startsWith('gpt')) return 'openai';
    if (model.startsWith('gemini')) return 'gemini';
    return this.config.defaultProvider;
  }

  /**
   * Make Claude/Anthropic API request
   */
  private async makeClaudeRequest(request: AIRequest, model: string): Promise<AIResponse> {
    if (!this.config.claudeApiKey) {
      throw new Error('Claude API key not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.claudeApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          messages: request.messages.filter(m => m.role !== 'system'),
          system: request.messages.find(m => m.role === 'system')?.content,
          max_tokens: request.maxTokens || 4000,
          temperature: request.temperature ?? this.config.temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API error: ${response.status} ${error}`);
      }

      const data = await response.json();

      return {
        content: data.content[0].text,
        model: data.model,
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Make OpenAI API request
   */
  private async makeOpenAIRequest(request: AIRequest, model: string): Promise<AIResponse> {
    if (!this.config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.openaiApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: request.messages,
          max_tokens: request.maxTokens || 4000,
          temperature: request.temperature ?? this.config.temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${error}`);
      }

      const data = await response.json();

      return {
        content: data.choices[0].message.content,
        model: data.model,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Make Google Gemini API request
   */
  private async makeGeminiRequest(request: AIRequest, model: string): Promise<AIResponse> {
    throw new Error('Gemini provider not yet implemented');
  }

  /**
   * Test configuration - verify all environment variables and connectivity
   */
  async testConfiguration(): Promise<{
    success: boolean;
    config: AIConfig;
    databaseConnection: boolean;
    errors: string[];
    testResults?: {
      standard?: { success: boolean; latencyMs: number; error?: string };
      lightweight?: { success: boolean; latencyMs: number; error?: string };
    };
  }> {
    const errors: string[] = [];
    const testResults: any = {};

    // Check required environment variables
    if (!this.config.claudeApiKey && this.config.defaultProvider === 'anthropic') {
      errors.push('CLAUDE_API_KEY not configured');
    }

    if (!this.config.openaiApiKey && this.config.defaultProvider === 'openai') {
      errors.push('OPENAI_GLOBAL_API not configured');
    }

    // Test database connection
    let databaseConnection = false;
    try {
      const { data, error } = await this.supabase
        .from('ai_model_configurations')
        .select('id')
        .limit(1);
      
      databaseConnection = !error;
      if (error) {
        errors.push(`Database connection failed: ${error.message}`);
      }
    } catch (error) {
      errors.push(`Database error: ${(error as Error).message}`);
    }

    // Test standard model
    if (!errors.length) {
      try {
        const startTime = Date.now();
        await this.generateContent({
          messages: [{ role: 'user', content: 'Say "OK"' }],
          maxTokens: 10,
        }, 'standard');
        testResults.standard = {
          success: true,
          latencyMs: Date.now() - startTime,
        };
      } catch (error) {
        testResults.standard = {
          success: false,
          latencyMs: 0,
          error: (error as Error).message,
        };
        errors.push(`Standard model test failed: ${(error as Error).message}`);
      }
    }

    // Test lightweight model
    if (!errors.length) {
      try {
        const startTime = Date.now();
        await this.generateContent({
          messages: [{ role: 'user', content: 'Say "OK"' }],
          maxTokens: 10,
        }, 'lightweight');
        testResults.lightweight = {
          success: true,
          latencyMs: Date.now() - startTime,
        };
      } catch (error) {
        testResults.lightweight = {
          success: false,
          latencyMs: 0,
          error: (error as Error).message,
        };
        errors.push(`Lightweight model test failed: ${(error as Error).message}`);
      }
    }

    return {
      success: errors.length === 0,
      config: {
        ...this.config,
        claudeApiKey: this.config.claudeApiKey ? '***configured***' : undefined,
        openaiApiKey: this.config.openaiApiKey ? '***configured***' : undefined,
      } as any,
      databaseConnection,
      errors,
      testResults: Object.keys(testResults).length > 0 ? testResults : undefined,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): AIConfig {
    return {
      ...this.config,
      claudeApiKey: this.config.claudeApiKey ? '***configured***' : undefined,
      openaiApiKey: this.config.openaiApiKey ? '***configured***' : undefined,
    } as any;
  }
}
