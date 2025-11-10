# Smart Grocery Delivery Integration

## Overview

The Smart Grocery Delivery Integration allows users to seamlessly order groceries directly from their meal plans through popular delivery services (Instacart, Amazon Fresh, Walmart, Shipt, Target). It converts grocery lists into delivery orders, provides cost estimates, tracks order status, and eliminates the friction of manually transferring items between apps.

## Business Value

### Key Benefits
- **Eliminates Manual Work**: No copying items between apps (saves 15-20 minutes per order)
- **Increases Conversion**: Seamless ordering increases likelihood of purchase
- **Partnership Revenue**: Potential affiliate commissions from delivery providers
- **Premium Feature**: Can be monetized as premium/pro feature
- **Retention Driver**: Users stay in ecosystem for complete meal planning → ordering flow

### Expected Metrics
- **60%** of users try delivery integration within first month
- **30%** use it regularly (weekly/bi-weekly)
- **$10-15** average order value commission potential
- **25%** reduction in grocery planning time
- **40%** increase in meal plan completion rates

## Architecture

### Database Schema (7 Tables)

**delivery_providers** - Supported delivery services
- Provider info (name, logo, website)
- API configuration (endpoint, auth type)
- Features (scheduled delivery, express, price matching)
- Pricing (min order, delivery fee)

**user_delivery_accounts** - User connections to providers
- OAuth tokens (encrypted)
- API keys (encrypted)
- Preferred store settings
- Connection status tracking

**grocery_delivery_orders** - Order tracking
- Order details (items, pricing, delivery)
- Status tracking (draft → submitted → delivered)
- Provider information
- Source tracking (from meal plan)

**delivery_order_history** - Status change log
- Historical status changes
- Messages and metadata from provider

**order_substitutions** - Item replacements
- Original vs substituted items
- Reason for substitution
- Customer approval tracking

**delivery_pricing_cache** - Price estimates
- Cached pricing data from providers
- 7-day expiration
- Used for cost estimates

**delivery_preferences** - User settings
- Preferred provider
- Delivery preferences (day, time, type)
- Substitution preferences
- Budget settings
- Auto-order configuration

### Supported Providers

1. **Instacart** - Most coverage, fastest delivery
2. **Amazon Fresh** - Free delivery for Prime members
3. **Walmart Grocery** - Low prices, wide availability
4. **Shipt** - Target partnership, quality focus
5. **Target Same Day** - Fast urban delivery

## Components

### GroceryDeliveryPanel
Comprehensive panel for grocery delivery management.

**Features:**
- Provider selection dropdown
- Cost estimate button
- Recent orders list with status
- Order creation flow
- Order details dialog
- Submit order functionality

**Usage:**
```tsx
<GroceryDeliveryPanel
  householdId={householdId}
  className="max-w-4xl mx-auto"
/>
```

## Edge Function

### process-delivery-order
Handles all delivery order operations.

**Endpoint:** `POST /functions/v1/process-delivery-order`

**Actions:**

**1. estimate** - Get cost estimate
```json
{
  "action": "estimate",
  "providerId": "uuid",
  "items": [
    {"name": "Milk", "quantity": 2, "estimated_price": 4.99}
  ]
}
```

**Response:**
```json
{
  "subtotal": "24.50",
  "delivery_fee": "5.99",
  "service_fee": "1.23",
  "tax": "1.96",
  "total": "33.68",
  "items_count": 8,
  "note": "This is an estimate..."
}
```

**2. create** - Create draft order from grocery list
```json
{
  "action": "create",
  "householdId": "uuid",
  "userId": "uuid",
  "providerId": "uuid"
}
```

**3. submit** - Submit order to provider
```json
{
  "action": "submit",
  "orderId": "uuid"
}
```

**4. status** - Check order status
```json
{
  "action": "status",
  "orderId": "uuid"
}
```

**5. cancel** - Cancel pending order
```json
{
  "action": "cancel",
  "orderId": "uuid"
}
```

## Real API Integration Points

The edge function includes detailed comments showing where real API integrations would go:

**1. Price Estimation**
```typescript
// Instacart: POST /v2/partners/retailers/{retailer_id}/estimate
// Amazon Fresh: SP-API Product Pricing API
// Walmart: /api/pricing/estimate
```

**2. Order Submission**
```typescript
// Instacart: POST /v2/partners/orders
// Amazon Fresh: Fresh API (requires partnership)
// Walmart: POST /api/orders
```

**3. Status Checking**
```typescript
// Instacart: GET /v2/partners/orders/{order_id}
// Amazon Fresh: GET /orders/{order_id}/status
```

**4. Order Cancellation**
```typescript
// Instacart: DELETE /v2/partners/orders/{order_id}
// May have time limits (can't cancel after shopper starts)
```

## Database Functions

### create_order_from_grocery_list()
Creates delivery order from household grocery list.

```sql
SELECT create_order_from_grocery_list(
  p_household_id := 'household-uuid',
  p_user_id := 'user-uuid',
  p_provider_id := 'provider-uuid',
  p_delivery_type := 'standard'
);
```

Returns:
```json
{
  "order_id": "uuid",
  "item_count": 15,
  "estimated_total": 127.50
}
```

### update_order_status()
Updates order status and records in history.

```sql
SELECT update_order_status(
  p_order_id := 'order-uuid',
  p_status := 'confirmed',
  p_message := 'Order confirmed by provider',
  p_metadata := '{"shopper_name": "John", "eta": "2025-11-15T18:00:00Z"}'::jsonb
);
```

## Integration Guide

### Step 1: Add to Dashboard

```tsx
import { GroceryDeliveryPanel } from '@/components/GroceryDeliveryPanel';

function Dashboard() {
  const { householdId } = useHousehold();

  return (
    <div className="container py-6 space-y-6">
      <h1>Meal Planning</h1>

      {/* Existing components */}
      <MealPlanCalendar />
      <GroceryList />

      {/* Add delivery panel */}
      <GroceryDeliveryPanel householdId={householdId} />
    </div>
  );
}
```

### Step 2: Set Up Provider API Keys

For production integration with real providers:

```bash
# Instacart
supabase secrets set INSTACART_API_KEY=your-key
supabase secrets set INSTACART_PARTNER_ID=your-id

# Amazon Fresh
supabase secrets set AMAZON_SP_API_CLIENT_ID=your-id
supabase secrets set AMAZON_SP_API_CLIENT_SECRET=your-secret

# Walmart
supabase secrets set WALMART_API_KEY=your-key
supabase secrets set WALMART_CONSUMER_ID=your-id
```

### Step 3: Configure Provider Details

Update provider API endpoints in database:

```sql
UPDATE delivery_providers
SET
  api_endpoint = 'https://api.instacart.com',
  requires_oauth = true,
  auth_type = 'oauth'
WHERE provider_name = 'instacart';
```

### Step 4: Handle OAuth Connections

For providers requiring OAuth (Instacart, Amazon):

```tsx
async function connectInstacart() {
  // Redirect to provider OAuth
  const authUrl = `https://connect.instacart.com/oauth/authorize?
    client_id=${clientId}&
    redirect_uri=${redirectUri}&
    response_type=code&
    scope=orders:read orders:write`;

  window.location.href = authUrl;
}

// Handle callback
async function handleOAuthCallback(code: string) {
  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code);

  // Save to user_delivery_accounts
  await supabase.from('user_delivery_accounts').insert({
    user_id: userId,
    household_id: householdId,
    provider_id: providerId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: tokens.expires_at,
    is_connected: true,
  });
}
```

## User Flows

### Flow 1: First-Time Order
1. User completes meal planning for the week
2. Grocery list auto-generated from recipes
3. User opens Grocery Delivery panel
4. Selects "Instacart" from provider dropdown
5. Clicks "Get Cost Estimate"
6. Sees estimate: $127.50 (subtotal) + $5.99 (delivery) = $133.49
7. Clicks "Create Order"
8. Reviews order details in dialog
9. Clicks "Submit Order"
10. Order submitted to Instacart API
11. Receives confirmation with order number
12. Can track status in app

### Flow 2: Tracking Order Status
1. User opens Grocery Delivery panel
2. Sees recent order: "Order #ABC123 - Shopping"
3. Clicks on order to view details
4. Sees live status updates:
   - Confirmed (10:00 AM)
   - Shopper assigned: Sarah (4.9★)
   - Shopping in progress (10:15 AM)
   - Out for delivery (10:45 AM)
   - Delivered (11:30 AM)

### Flow 3: Handling Substitutions
1. Order status updates to "Shopping"
2. Shopper finds item out of stock
3. System receives substitution notification
4. User gets push notification: "Shopper suggests Organic Milk ($5.99) instead of Regular Milk ($4.99). Approve?"
5. User approves in app
6. Substitution recorded in database
7. Order total updated

## Testing Checklist

### Database
- [ ] Migration runs successfully
- [ ] All 7 tables created
- [ ] Indexes improve query performance
- [ ] RLS policies prevent cross-household access
- [ ] Functions execute correctly
- [ ] Triggers update timestamps

### Edge Function
- [ ] Estimate action returns pricing
- [ ] Create action generates order from grocery list
- [ ] Submit action updates status correctly
- [ ] Status action retrieves order details
- [ ] Cancel action works for pending orders
- [ ] Error handling works gracefully

### Component
- [ ] Provider selection dropdown populates
- [ ] Cost estimate displays correctly
- [ ] Order creation succeeds
- [ ] Recent orders list displays
- [ ] Order details dialog shows all info
- [ ] Submit order button works
- [ ] Status badges show correct colors
- [ ] Loading states appear during operations

### Integration
- [ ] Can create order from grocery list
- [ ] Order appears in recent orders immediately
- [ ] Status updates reflect in UI
- [ ] Multiple users don't interfere
- [ ] Provider connections persist

### Edge Cases
- [ ] Empty grocery list
- [ ] Provider API timeout
- [ ] Invalid provider ID
- [ ] Order already submitted
- [ ] Network failure during submission
- [ ] Expired OAuth token

## Deployment

### 1. Run Migration
```bash
supabase db push
```

### 2. Seed Providers
Providers are automatically seeded in migration:
- Instacart
- Amazon Fresh
- Walmart
- Shipt
- Target

### 3. Deploy Function
```bash
supabase functions deploy process-delivery-order
```

### 4. Test Simulation
```bash
curl -X POST \
  'YOUR_URL/functions/v1/process-delivery-order' \
  -H 'Authorization: Bearer TOKEN' \
  -d '{
    "action": "estimate",
    "providerId": "provider-uuid",
    "items": [{"name": "Milk", "quantity": 2, "estimated_price": 4.99}]
  }'
```

### 5. Configure Real APIs (Production)

**For Instacart Partnership:**
1. Apply at https://www.instacart.com/partnerships
2. Get API credentials
3. Update provider endpoint
4. Implement OAuth flow
5. Test with real orders

**For Amazon Fresh:**
1. Join Amazon SP-API program
2. Register application
3. Get LWA credentials
4. Implement refresh token flow
5. Test product lookups

## Performance

### Optimization
- Pricing cache reduces API calls (7-day TTL)
- Batch order creation from grocery list
- Status polling uses exponential backoff
- Order history limited to 10 recent orders

### Cost Estimation
Without real APIs:
- Uses cached pricing data
- Falls back to item.estimated_price
- Applies standard fees
- 7-day cache expiration

With real APIs:
- Real-time pricing lookups
- Accurate fees and taxes
- Store-specific pricing
- Availability checking

## Troubleshooting

### No Providers Showing
1. Check `delivery_providers` table has data
2. Verify `is_active = true`
3. Check RLS policies allow reading

### Can't Create Order
1. Verify grocery list has items
2. Check household_id is correct
3. Ensure user is authenticated
4. Review edge function logs

### Order Stuck in Draft
1. Check provider API credentials
2. Review order details completeness
3. Verify delivery address is valid
4. Check edge function error logs

### Estimate Doesn't Match Final
- Estimates use cached/default prices
- Real prices come from provider API
- Availability affects final pricing
- Substitutions change totals

## Future Enhancements

### Phase 2
- [ ] Auto-order on schedule (e.g., every Sunday)
- [ ] Price comparison across providers
- [ ] Coupon/promo code support
- [ ] Delivery slot preferences
- [ ] Recurring orders for staples

### Phase 3
- [ ] In-app substitution approval
- [ ] Real-time shopper chat
- [ ] Delivery tracking map
- [ ] Receipt OCR for actual prices
- [ ] Budget tracking and alerts

## Partnership Opportunities

### Revenue Models
1. **Affiliate Commissions**: 2-5% per order
2. **Referral Bonuses**: $10-20 per new customer
3. **Premium Feature**: $4.99/month for unlimited orders
4. **API Usage Fees**: Pass through to users or absorb

### Provider Contact
- **Instacart**: partnerships@instacart.com
- **Amazon**: sp-api-support@amazon.com
- **Walmart**: developer.walmart.com
- **Shipt**: business@shipt.com

## License

Internal use only - TryEatPal Meal Planning App

**Note**: This implementation is a framework/simulation. Real integrations require:
- API partnerships with delivery providers
- OAuth/API key credentials
- Compliance with provider terms of service
- PCI compliance for payment processing (if applicable)
- Testing in provider sandbox environments
