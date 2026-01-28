# Defense-in-Depth Security Layers

> **Last Updated**: 2026-01-28
> **Status**: Production Ready
> **Coverage**: All protected routes and resources

---

## Overview

This document describes the defense-in-depth security architecture implemented in the EatPal application. The system uses multiple independent security layers to ensure that even if one layer fails, others continue to protect the system.

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Authentication (WHO are you?)                 │
│  - Session validation, JWT verification                 │
│  - Validates that user is authenticated                 │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Authorization (WHAT can you do?)              │
│  - Permission checks (e.g., 'food.view_own')            │
│  - Role level checks (roleLevel >= 5)                   │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Resource Ownership (IS this yours?)           │
│  - Tenant/household filtering                           │
│  - Owner checks (createdBy = userId for "own" access)   │
├─────────────────────────────────────────────────────────┤
│  Layer 4: Database RLS (FINAL enforcement)              │
│  - Row-level security policies in PostgreSQL            │
│  - Even if code has bugs, DB rejects unauthorized       │
└─────────────────────────────────────────────────────────┘
```

---

## Layer 1: Authentication

**Question Answered**: WHO are you?

### Implementation

- **Location**: `src/lib/security-layers.ts` - `AuthenticationLayer`
- **Hook**: `useRequireAuth()` from `src/hooks/useSecurityLayers.ts`
- **Component**: `<AuthenticatedRoute>` from `src/components/security/`

### Features

- Session validation via Supabase JWT
- Automatic token refresh handling
- Account lock detection
- Session ID tracking for audit logs

### Usage

```tsx
// Hook-based (in component)
import { useRequireAuth } from '@/hooks/useSecurityLayers';

function MyComponent() {
  const { isAuthenticated, isLoading, userId } = useRequireAuth();

  if (isLoading) return <Spinner />;
  // Automatically redirects to /auth if not authenticated

  return <div>Welcome, user {userId}!</div>;
}

// Component-based (in routes)
import { AuthenticatedRoute } from '@/components/security';

<Route path="/dashboard" element={
  <AuthenticatedRoute>
    <Dashboard />
  </AuthenticatedRoute>
} />
```

### Programmatic Check

```typescript
import { authLayer } from '@/lib/security-layers';

// Validate session
const { valid, userId, sessionId } = await authLayer.validateSession();

// Require authentication (throws if not authenticated)
const { userId, sessionId } = await authLayer.requireAuth();

// Check if account is locked
const isLocked = await authLayer.isAccountLocked(userId);
```

---

## Layer 2: Authorization

**Question Answered**: WHAT can you do?

### Implementation

- **Location**: `src/lib/security-layers.ts` - `AuthorizationLayer`
- **Database**: `permissions`, `role_permissions`, `role_levels` tables
- **Hooks**: `useRequirePermission()`, `useRequireRoleLevel()`, `useRequireAdmin()`
- **Components**: `<PermissionRoute>`, `<RoleLevelRoute>`, `<AdminRoute>`

### Permission System

Permissions follow the naming convention: `category.action(_scope)`

**Categories**:
- `food` - Food item management
- `recipe` - Recipe management
- `kid` - Child profile management
- `planner` - Meal planning
- `grocery` - Grocery lists
- `subscription` - Subscription management
- `profile` - User profile
- `admin` - Administrative functions
- `moderator` - Moderation functions

**Actions/Scopes**:
- `view_own` - View user's own data
- `view_household` - View household data
- `view_all` - View all data (admin)
- `create` - Create new records
- `update_own` - Update own records
- `update_household` - Update household records
- `delete_own` - Delete own records
- `manage_own` - Full management of own data

**Example Permissions**:
```
food.view_own
food.view_household
food.create
food.update_own
recipe.view_public
admin.dashboard
admin.users.manage
```

### Role Levels

| Role | Level | Permissions |
|------|-------|-------------|
| User | 1 | Basic CRUD on own/household data |
| Moderator | 5 | User permissions + content moderation |
| Admin | 10 | All permissions |

### Usage

```tsx
// Require specific permission
import { useRequirePermission } from '@/hooks/useSecurityLayers';

function EditFood({ foodId }) {
  const { isAuthorized, isLoading } = useRequirePermission('food.update_own');

  if (isLoading) return <Spinner />;
  if (!isAuthorized) return <PermissionDenied />;

  return <FoodEditor id={foodId} />;
}

// Require role level
import { useRequireRoleLevel } from '@/hooks/useSecurityLayers';
import { RoleLevels } from '@/lib/security-layers';

function ModeratorPanel() {
  const { isAuthorized } = useRequireRoleLevel(RoleLevels.MODERATOR);
  // ...
}

// Admin-only shortcut
import { useRequireAdmin } from '@/hooks/useSecurityLayers';

function AdminSettings() {
  const { isAuthorized } = useRequireAdmin();
  // ...
}

// Route-based protection
import { PermissionRoute, AdminRoute } from '@/components/security';

<Route path="/food/edit/:id" element={
  <PermissionRoute permission="food.update_own">
    <FoodEditor />
  </PermissionRoute>
} />

<Route path="/admin" element={
  <AdminRoute>
    <AdminDashboard />
  </AdminRoute>
} />
```

### Programmatic Check

```typescript
import { authzLayer } from '@/lib/security-layers';

// Check permission
const hasPermission = await authzLayer.hasPermission(userId, 'food.view_own');

// Check role level
const hasLevel = await authzLayer.hasRoleLevel(userId, RoleLevels.ADMIN);

// Get all permissions
const permissions = await authzLayer.getPermissions(userId);

// Require permission (throws if not granted)
await authzLayer.requirePermission(userId, 'admin.dashboard', {
  resourceType: 'admin_panel',
  logDenial: true,
});
```

---

## Layer 3: Resource Ownership

**Question Answered**: IS this resource yours?

### Implementation

- **Location**: `src/lib/security-layers.ts` - `OwnershipLayer`
- **Database Functions**: `is_resource_owner()`, `is_household_resource()`, `get_user_household_id()`
- **Hooks**: `useResourceOwnership()`, `useRequireOwnership()`
- **Components**: `<ShowIfOwner>`

### Ownership Model

Resources can be owned at two levels:
1. **User-level**: `user_id` column matches current user
2. **Household-level**: `household_id` column matches user's household

### Usage

```tsx
// Check resource ownership
import { useResourceOwnership } from '@/hooks/useSecurityLayers';

function FoodDetail({ food }) {
  const { canAccess, isOwner, isHouseholdMember, isAdmin, isLoading } =
    useResourceOwnership({
      user_id: food.user_id,
      household_id: food.household_id,
    });

  if (isLoading) return <Spinner />;
  if (!canAccess) return <NotYourResource />;

  return (
    <div>
      <h1>{food.name}</h1>
      {(isOwner || isAdmin) && <DeleteButton />}
    </div>
  );
}

// Require ownership (redirects if not owner)
import { useRequireOwnership } from '@/hooks/useSecurityLayers';

function EditFood({ food }) {
  const { canAccess } = useRequireOwnership(
    { user_id: food.user_id, household_id: food.household_id },
    {
      allowHousehold: true,  // Allow household members
      redirectTo: '/dashboard/pantry',
    }
  );
  // ...
}

// Conditional rendering
import { ShowIfOwner } from '@/components/security';

<ShowIfOwner resource={food} allowHousehold={true}>
  <EditButton />
</ShowIfOwner>
```

### Programmatic Check

```typescript
import { ownershipLayer } from '@/lib/security-layers';

// Check direct ownership
const isOwner = ownershipLayer.isOwner(userId, resource.user_id);

// Check household membership
const isHousehold = await ownershipLayer.isHouseholdResource(userId, resource.household_id);

// Full access check
const result = await ownershipLayer.canAccessResource(userId, resource, {
  allowHousehold: true,
  allowAdmin: true,
});

if (!result.allowed) {
  console.log(`Denied: ${result.reason}`);
}
```

---

## Layer 4: Database RLS

**Purpose**: FINAL enforcement - even if application code has bugs, the database rejects unauthorized access.

### Implementation

- **Location**: `supabase/migrations/20260128000000_defense_in_depth_security.sql`
- **Functions**: `can_access_resource()`, `has_permission()`, `has_role_level()`

### Key RLS Policies

```sql
-- Users can only see their own data
CREATE POLICY "Users view own records"
  ON public.foods FOR SELECT
  USING (auth.uid() = user_id);

-- Users can see household data
CREATE POLICY "Users view household records"
  ON public.foods FOR SELECT
  USING (public.is_household_resource(auth.uid(), household_id));

-- Admins can see all data
CREATE POLICY "Admins view all"
  ON public.foods FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Multi-layer access check
CREATE POLICY "Full access check"
  ON public.foods FOR ALL
  USING (public.can_access_resource(
    auth.uid(),
    user_id,
    household_id,
    'food.view_own',
    'food.view_household'
  ));
```

### Database Helper Functions

```sql
-- Check if user has permission
SELECT public.has_permission('user-uuid', 'food.view_own');

-- Check if user has minimum role level
SELECT public.has_role_level('user-uuid', 5);

-- Get user's role level
SELECT public.get_user_role_level('user-uuid');

-- Get all user permissions
SELECT public.get_user_permissions('user-uuid');

-- Check if resource is in user's household
SELECT public.is_household_resource('user-uuid', 'household-uuid');
```

---

## Combined Security Check

For comprehensive protection, use the combined security context:

```tsx
import { useSecureAccess } from '@/hooks/useSecurityLayers';

function FoodEditor({ food }) {
  const { isAllowed, isLoading, result } = useSecureAccess(
    'food.update_own',           // Required permission
    {                            // Resource to check ownership
      user_id: food.user_id,
      household_id: food.household_id,
    },
    {
      allowHousehold: true,      // Allow household members
      redirectOnAuthFail: '/auth',
      redirectOnDenied: '/dashboard',
      showToasts: true,
    }
  );

  if (isLoading) return <Spinner />;
  if (!isAllowed) {
    // Automatically handled based on which layer failed
    // - Layer 1 failure: Redirects to /auth
    // - Layer 2 failure: Shows permission denied
    // - Layer 3 failure: Shows ownership denied
    return null;
  }

  return <FoodEditorForm food={food} />;
}
```

### Programmatic Combined Check

```typescript
import { securityLayers } from '@/lib/security-layers';

// Check all layers
const result = await securityLayers.checkAccess(
  'food.update_own',
  { user_id: food.user_id, household_id: food.household_id },
  { allowHousehold: true }
);

if (!result.allowed) {
  console.log(`Denied at layer: ${result.layer}, reason: ${result.reason}`);
}

// Enforce all layers (throws on failure)
try {
  const { userId, sessionId } = await securityLayers.enforceAccess(
    'food.update_own',
    resource
  );
  // Access granted
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Layer 1 failed
  } else if (error instanceof AuthorizationError) {
    // Layer 2 failed
  } else if (error instanceof OwnershipError) {
    // Layer 3 failed
  }
}
```

---

## Security Context Provider

The `SecurityProvider` component provides security context to all child components:

```tsx
// In App.tsx
import { SecurityProvider } from '@/hooks/useSecurityLayers';

function App() {
  return (
    <BrowserRouter>
      <SecurityProvider>
        <Routes>
          {/* Your routes */}
        </Routes>
      </SecurityProvider>
    </BrowserRouter>
  );
}

// In any child component
import { useSecurityContext } from '@/hooks/useSecurityLayers';

function MyComponent() {
  const {
    context,           // Full security context
    isLoading,         // Loading state
    checkPermission,   // Sync permission check
    checkRoleLevel,    // Sync role level check
    checkOwnership,    // Async ownership check
    refresh,           // Refresh context
  } = useSecurityContext();

  // Access context data
  console.log(context.userId);
  console.log(context.householdId);
  console.log(context.permissions);
  console.log(context.roleLevel);
  console.log(context.isAdmin);
  console.log(context.isModerator);
}
```

---

## Conditional Rendering Components

For showing/hiding UI elements based on permissions:

```tsx
import {
  ShowIfPermitted,
  ShowIfRoleLevel,
  AdminOnly,
  ModeratorOnly,
  ShowIfOwner,
} from '@/components/security';

function FoodCard({ food }) {
  return (
    <Card>
      <h3>{food.name}</h3>

      {/* Show edit button if user has permission */}
      <ShowIfPermitted permission="food.update_own">
        <EditButton />
      </ShowIfPermitted>

      {/* Show delete button only if owner */}
      <ShowIfOwner resource={food}>
        <DeleteButton />
      </ShowIfOwner>

      {/* Admin-only controls */}
      <AdminOnly>
        <AdminControls />
      </AdminOnly>
    </Card>
  );
}
```

---

## Error Handling

Use the security error handler for consistent error handling:

```tsx
import { useSecurityErrorHandler } from '@/hooks/useSecurityLayers';

function MyComponent() {
  const { handleError } = useSecurityErrorHandler();

  const handleSave = async () => {
    try {
      await securityLayers.enforceAccess('food.update_own', resource);
      await saveFood(data);
    } catch (error) {
      handleError(error, {
        showToast: true,
        redirect: '/dashboard',
      });
    }
  };
}
```

---

## Audit Logging

All security checks are automatically logged to the audit trail:

- `PERMISSION_DENIED` - When Layer 2 denies access
- `PERMISSION_CHECK` - When permissions are verified
- `SESSION_EXPIRED` - When Layer 1 fails

View logs in the admin dashboard or query directly:

```typescript
import { securityAudit } from '@/lib/security-audit';

const denials = await securityAudit.queryLogs({
  eventType: 'PERMISSION_DENIED',
  userId: currentUserId,
  startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
});
```

---

## Best Practices

### 1. Always Use Multiple Layers

```tsx
// ✅ Good - uses all layers
<SecureRoute permission="food.update_own" resource={food}>
  <FoodEditor />
</SecureRoute>

// ❌ Bad - only uses Layer 1
<ProtectedRoute>
  <FoodEditor />
</ProtectedRoute>
```

### 2. Be Specific with Permissions

```typescript
// ✅ Good - specific permission
await authzLayer.requirePermission(userId, 'food.update_own');

// ❌ Bad - too broad
await authzLayer.requireRoleLevel(userId, RoleLevels.USER);
```

### 3. Always Check Ownership for Mutations

```typescript
// ✅ Good - checks ownership before mutation
const canAccess = await ownershipLayer.canAccessResource(userId, food, {
  allowHousehold: false, // Only owner can delete
});
if (canAccess.allowed) {
  await deleteFood(food.id);
}

// ❌ Bad - no ownership check
await deleteFood(food.id);
```

### 4. Log Security Events

```typescript
// ✅ Good - logs sensitive operations
await securityAudit.logData('USER_DELETED', adminId, {
  targetUserId: userId,
  reason: 'user_request',
});
```

### 5. Trust RLS as Final Defense

RLS policies are the last line of defense. Even if all application code is bypassed, RLS will prevent unauthorized data access.

---

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/security-layers.ts` | Core security layer classes |
| `src/hooks/useSecurityLayers.ts` | React hooks for security |
| `src/components/security/SecureRoute.tsx` | Route protection components |
| `src/components/security/index.ts` | Component exports |
| `supabase/migrations/20260128000000_defense_in_depth_security.sql` | Database schema & RLS |
| `src/lib/security-audit.ts` | Audit logging |

---

## Migration Guide

To migrate existing `ProtectedRoute` usage to the new security layers:

### Before
```tsx
<Route path="/food/edit/:id" element={
  <ProtectedRoute>
    <FoodEditor />
  </ProtectedRoute>
} />
```

### After
```tsx
<Route path="/food/edit/:id" element={
  <PermissionRoute permission="food.update_own">
    <FoodEditor />
  </PermissionRoute>
} />
```

For admin routes:
```tsx
// Before
<Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />

// After
<Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
```

---

**Last Updated**: 2026-01-28
