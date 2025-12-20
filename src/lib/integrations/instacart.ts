/**
 * Instacart Developer Platform Integration
 * 
 * Phase 2.1 Implementation
 * Handles grocery ordering integration with Instacart
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from "@/lib/logger";

export interface InstacartConfig {
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface InstacartProduct {
  id: string;
  name: string;
  brand?: string;
  size: string;
  price: number;
  imageUrl?: string;
  availability: 'in_stock' | 'low_stock' | 'out_of_stock';
  storeId: string;
  storeName: string;
}

export interface InstacartStore {
  id: string;
  name: string;
  address: string;
  distance?: number;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
}

export interface IngredientMatch {
  ingredient: string;
  originalQuantity: string;
  originalUnit: string;
  matchedProducts: InstacartProduct[];
  confidence: number; // 0-1
  estimatedQuantity: number;
  estimatedUnit: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
  notes?: string;
}

export interface InstacartOrder {
  cartId: string;
  storeId: string;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  total: number;
  deliveryTime?: string;
  pickupTime?: string;
}

/**
 * Instacart API Client
 */
export class InstacartAPI {
  private config: InstacartConfig;

  constructor(config: InstacartConfig) {
    this.config = config;
  }

  /**
   * Search for products by ingredient name
   */
  async searchProducts(
    ingredient: string,
    storeId?: string
  ): Promise<InstacartProduct[]> {
    if (!this.config.enabled) {
      throw new Error('Instacart integration is not enabled. Configure API key in Admin > Integrations.');
    }

    if (!this.config.apiKey) {
      throw new Error('Instacart API key is not configured. Set up in Admin > Integrations.');
    }

    try {
      const baseUrl = this.config.baseUrl || 'https://connect.instacart.com';

      const response = await fetch(`${baseUrl}/v1/products/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: ingredient,
          store_id: storeId,
          limit: 10,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Instacart API error:', { status: response.status, error: errorText });
        throw new Error(`Instacart API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Map Instacart API response to our interface
      return (data.products || []).map((product: any) => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        size: product.size,
        price: product.price,
        imageUrl: product.image_url,
        availability: product.availability || 'in_stock',
        storeId: storeId || product.store_id,
        storeName: product.store_name,
      }));
    } catch (error) {
      logger.error('Error searching Instacart products:', error);
      throw error;
    }
  }

  /**
   * Get available stores near a location
   */
  async getStores(zipCode: string): Promise<InstacartStore[]> {
    if (!this.config.enabled) {
      throw new Error('Instacart integration is not enabled. Configure API key in Admin > Integrations.');
    }

    if (!this.config.apiKey) {
      throw new Error('Instacart API key is not configured. Set up in Admin > Integrations.');
    }

    try {
      const baseUrl = this.config.baseUrl || 'https://connect.instacart.com';

      const response = await fetch(`${baseUrl}/v1/stores?zip_code=${encodeURIComponent(zipCode)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Instacart API error:', { status: response.status, error: errorText });
        throw new Error(`Instacart API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Map Instacart API response to our interface
      return (data.stores || []).map((store: any) => ({
        id: store.id,
        name: store.name,
        address: store.address,
        distance: store.distance,
        deliveryAvailable: store.delivery_available,
        pickupAvailable: store.pickup_available,
      }));
    } catch (error) {
      logger.error('Error fetching Instacart stores:', error);
      throw error;
    }
  }

  /**
   * Create a cart with items
   */
  async createCart(
    storeId: string,
    items: CartItem[]
  ): Promise<InstacartOrder> {
    if (!this.config.enabled) {
      throw new Error('Instacart integration is not enabled. Configure API key in Admin > Integrations.');
    }

    if (!this.config.apiKey) {
      throw new Error('Instacart API key is not configured. Set up in Admin > Integrations.');
    }

    try {
      const baseUrl = this.config.baseUrl || 'https://connect.instacart.com';

      const response = await fetch(`${baseUrl}/v1/carts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          store_id: storeId,
          items: items.map(item => ({
            product_id: item.productId,
            quantity: item.quantity,
            notes: item.notes,
          })),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Instacart API error:', { status: response.status, error: errorText });
        throw new Error(`Instacart API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      return {
        cartId: data.cart_id,
        storeId: data.store_id,
        items: items,
        subtotal: data.subtotal,
        deliveryFee: data.delivery_fee,
        serviceFee: data.service_fee,
        tax: data.tax,
        total: data.total,
        deliveryTime: data.delivery_time,
        pickupTime: data.pickup_time,
      };
    } catch (error) {
      logger.error('Error creating Instacart cart:', error);
      throw error;
    }
  }

  /**
   * Generate checkout URL for Instacart
   */
  getCheckoutUrl(cartId: string): string {
    // In production, return actual Instacart checkout URL
    return `https://www.instacart.com/store/checkout/${cartId}`;
  }
}

/**
 * Ingredient Matching Engine
 * Converts recipe ingredients to purchasable products
 */
export class IngredientMatcher {
  private api: InstacartAPI;

  constructor(api: InstacartAPI) {
    this.api = api;
  }

  /**
   * Parse ingredient string to extract quantity, unit, and item
   */
  parseIngredient(ingredient: string): {
    quantity: string;
    unit: string;
    item: string;
  } {
    // Remove leading/trailing whitespace
    const cleaned = ingredient.trim();

    // Match patterns like "2 cups flour", "1 lb chicken", "3 eggs"
    const pattern = /^(\d+\.?\d*)\s*([a-zA-Z]*)\s+(.+)$/;
    const match = cleaned.match(pattern);

    if (match) {
      return {
        quantity: match[1],
        unit: match[2] || 'unit',
        item: match[3],
      };
    }

    // No quantity found, assume 1
    return {
      quantity: '1',
      unit: 'unit',
      item: cleaned,
    };
  }

  /**
   * Convert recipe units to purchase units
   */
  convertToPurchaseQuantity(
    quantity: string,
    unit: string,
    item: string
  ): { quantity: number; unit: string } {
    const qty = parseFloat(quantity);

    // Convert common cooking units to purchase units
    const unitConversions: Record<string, { factor: number; targetUnit: string }> = {
      // Weight
      'oz': { factor: 1, targetUnit: 'oz' },
      'lb': { factor: 16, targetUnit: 'oz' },
      'g': { factor: 1, targetUnit: 'g' },
      'kg': { factor: 1000, targetUnit: 'g' },
      
      // Volume
      'cup': { factor: 8, targetUnit: 'fl oz' },
      'cups': { factor: 8, targetUnit: 'fl oz' },
      'tbsp': { factor: 0.5, targetUnit: 'fl oz' },
      'tablespoon': { factor: 0.5, targetUnit: 'fl oz' },
      'tsp': { factor: 0.167, targetUnit: 'fl oz' },
      'teaspoon': { factor: 0.167, targetUnit: 'fl oz' },
      'quart': { factor: 32, targetUnit: 'fl oz' },
      'gallon': { factor: 128, targetUnit: 'fl oz' },
      'ml': { factor: 1, targetUnit: 'ml' },
      'l': { factor: 1000, targetUnit: 'ml' },
      'liter': { factor: 1000, targetUnit: 'ml' },
      
      // Count
      'unit': { factor: 1, targetUnit: 'unit' },
      'piece': { factor: 1, targetUnit: 'unit' },
      'pieces': { factor: 1, targetUnit: 'unit' },
    };

    const conversion = unitConversions[unit.toLowerCase()] || { factor: 1, targetUnit: unit };

    return {
      quantity: qty * conversion.factor,
      unit: conversion.targetUnit,
    };
  }

  /**
   * Match ingredient to products
   */
  async matchIngredient(
    ingredient: string,
    storeId?: string
  ): Promise<IngredientMatch> {
    const parsed = this.parseIngredient(ingredient);
    const purchaseQty = this.convertToPurchaseQuantity(
      parsed.quantity,
      parsed.unit,
      parsed.item
    );

    // Search for products
    const products = await this.api.searchProducts(parsed.item, storeId);

    // Calculate confidence based on name similarity
    const matchedProducts = products.map(product => ({
      ...product,
      similarity: this.calculateSimilarity(parsed.item, product.name),
    }))
    .filter(p => p.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
    .map(({ similarity, ...product }) => product);

    const confidence = matchedProducts.length > 0 ? 
      this.calculateSimilarity(parsed.item, matchedProducts[0].name) : 0;

    return {
      ingredient,
      originalQuantity: parsed.quantity,
      originalUnit: parsed.unit,
      matchedProducts,
      confidence,
      estimatedQuantity: purchaseQty.quantity,
      estimatedUnit: purchaseQty.unit,
    };
  }

  /**
   * Calculate string similarity (simple implementation)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    // Exact match
    if (s1 === s2) return 1.0;

    // Contains match
    if (s2.includes(s1) || s1.includes(s2)) return 0.8;

    // Word overlap
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    const commonWords = words1.filter(w => words2.includes(w)).length;
    const totalWords = Math.max(words1.length, words2.length);

    return commonWords / totalWords;
  }

  /**
   * Match multiple ingredients at once
   */
  async matchIngredients(
    ingredients: string[],
    storeId?: string
  ): Promise<IngredientMatch[]> {
    const matches = await Promise.all(
      ingredients.map(ing => this.matchIngredient(ing, storeId))
    );

    return matches;
  }
}

/**
 * Get Instacart integration config from database
 */
export async function getInstacartConfig(): Promise<InstacartConfig> {
  try {
    // In production, fetch from secure database
    // const { data, error } = await supabase
    //   .from('integration_configs')
    //   .select('*')
    //   .eq('integration_id', 'instacart')
    //   .single();

    // Mock config for development
    return {
      apiKey: process.env.INSTACART_API_KEY || '',
      baseUrl: 'https://connect.instacart.com/v2',
      enabled: false, // Set to true when configured
    };
  } catch (error) {
    logger.error('Error loading Instacart config:', error);
    return {
      apiKey: '',
      enabled: false,
    };
  }
}

/**
 * Initialize Instacart integration
 */
export async function createInstacartClient(): Promise<{
  api: InstacartAPI;
  matcher: IngredientMatcher;
}> {
  const config = await getInstacartConfig();
  const api = new InstacartAPI(config);
  const matcher = new IngredientMatcher(api);

  return { api, matcher };
}

/**
 * Track integration usage for analytics
 */
export async function trackInstacartUsage(
  action: 'search' | 'cart_created' | 'checkout' | 'error',
  metadata?: Record<string, any>
): Promise<void> {
  try {
    // In production, log to analytics database
    // await supabase.from('integration_analytics').insert({
    //   integration: 'instacart',
    //   action,
    //   metadata,
    //   timestamp: new Date().toISOString(),
    // });

    logger.debug('Instacart usage:', action, metadata);
  } catch (error) {
    logger.error('Error tracking Instacart usage:', error);
  }
}

