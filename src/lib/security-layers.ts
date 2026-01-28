/**
 * Defense-in-Depth Security Layers
 *
 * This module implements a comprehensive 4-layer security architecture:
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Layer 1: Authentication (WHO are you?)                 │
 * │  - Session validation, JWT verification                 │
 * │  - Validates that user is authenticated                 │
 * ├─────────────────────────────────────────────────────────┤
 * │  Layer 2: Authorization (WHAT can you do?)              │
 * │  - Permission checks (e.g., 'food.view_own')            │
 * │  - Role level checks (roleLevel >= 5)                   │
 * ├─────────────────────────────────────────────────────────┤
 * │  Layer 3: Resource Ownership (IS this yours?)           │
 * │  - Tenant/household filtering                           │
 * │  - Owner checks (createdBy = userId for "own" access)   │
 * ├─────────────────────────────────────────────────────────┤
 * │  Layer 4: Database RLS (FINAL enforcement)              │
 * │  - Row-level security policies in PostgreSQL            │
 * │  - Even if code has bugs, DB rejects unauthorized       │
 * └─────────────────────────────────────────────────────────┘
 *
 * Usage:
 * ```typescript
 * import { SecurityLayers, useSecurityContext } from '@/lib/security-layers';
 *
 * // In a component
 * const { requireAuth, requirePermission, requireOwnership } = useSecurityContext();
 *
 * // Check authentication
 * if (!requireAuth()) return <LoginRequired />;
 *
 * // Check permission
 * if (!requirePermission('food.view_own')) return <AccessDenied />;
 *
 * // Check ownership
 * if (!requireOwnership(resource.user_id)) return <NotYourResource />;
 * ```
 */

import { supabase } from '@/integrations/supabase/client';
import { securityAudit } from './security-audit';
import { logger } from './logger';

const log = logger.withContext('SecurityLayers');

// ============================================
// Types
// ============================================

/**
 * Permission categories and their associated permissions
 */
export type PermissionCategory =
  | 'food'
  | 'recipe'
  | 'kid'
  | 'planner'
  | 'grocery'
  | 'subscription'
  | 'profile'
  | 'admin'
  | 'moderator';

/**
 * Standard permission actions with optional scope
 */
export type PermissionAction =
  | 'view_own'
  | 'view_household'
  | 'view_public'
  | 'view_all'
  | 'create'
  | 'update_own'
  | 'update_household'
  | 'update_all'
  | 'delete_own'
  | 'delete_household'
  | 'delete_all'
  | 'manage_own'
  | 'manage_all';

/**
 * Permission string format: category.action
 * Examples: 'food.view_own', 'admin.users.manage', 'recipe.create'
 */
export type Permission = `${PermissionCategory}.${string}`;

/**
 * Role names in the system
 */
export type RoleName = 'user' | 'moderator' | 'admin';

/**
 * Role level thresholds
 */
export const RoleLevels = {
  NONE: 0,
  USER: 1,
  MODERATOR: 5,
  ADMIN: 10,
} as const;

/**
 * Security context for a user session
 */
export interface SecurityContext {
  userId: string | null;
  sessionId: string | null;
  householdId: string | null;
  roleLevel: number;
  permissions: string[];
  roles: RoleName[];
  isAuthenticated: boolean;
  isAdmin: boolean;
  isModerator: boolean;
}

/**
 * Result of a security check
 */
export interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  layer?: 'authentication' | 'authorization' | 'ownership' | 'rls';
}

/**
 * Options for permission checks
 */
export interface PermissionCheckOptions {
  logDenial?: boolean;
  resourceType?: string;
  resourceId?: string;
}

/**
 * Options for ownership checks
 */
export interface OwnershipCheckOptions {
  allowHousehold?: boolean;
  allowAdmin?: boolean;
  resourceType?: string;
  resourceId?: string;
}

// ============================================
// Layer 1: Authentication
// ============================================

/**
 * Layer 1: Authentication - Validates WHO the user is
 */
export class AuthenticationLayer {
  private static instance: AuthenticationLayer;
  private log = logger.withContext('AuthLayer');

  static getInstance(): AuthenticationLayer {
    if (!AuthenticationLayer.instance) {
      AuthenticationLayer.instance = new AuthenticationLayer();
    }
    return AuthenticationLayer.instance;
  }

  /**
   * Validate that user has a valid session
   */
  async validateSession(): Promise<{ valid: boolean; userId: string | null; sessionId: string | null }> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        this.log.debug('No valid session found');
        return { valid: false, userId: null, sessionId: null };
      }

      // Check if session is expired
      const expiresAt = session.expires_at;
      if (expiresAt && Date.now() / 1000 > expiresAt) {
        this.log.warn('Session expired');
        return { valid: false, userId: null, sessionId: null };
      }

      // Get session ID from access token (or generate one)
      const sessionId = session.access_token?.slice(-16) || crypto.randomUUID();

      return {
        valid: true,
        userId: session.user.id,
        sessionId,
      };
    } catch (error) {
      this.log.error('Session validation error', error);
      return { valid: false, userId: null, sessionId: null };
    }
  }

  /**
   * Validate authentication and throw if not authenticated
   */
  async requireAuth(): Promise<{ userId: string; sessionId: string }> {
    const result = await this.validateSession();

    if (!result.valid || !result.userId) {
      await securityAudit.logAuth('LOGIN_FAILURE', null, {
        reason: 'session_invalid',
        layer: 'authentication',
      }, false);

      throw new AuthenticationError('Authentication required');
    }

    return { userId: result.userId, sessionId: result.sessionId! };
  }

  /**
   * Check if user account is locked
   */
  async isAccountLocked(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_locked, lock_reason')
        .eq('id', userId)
        .single();

      if (error) {
        this.log.error('Error checking account lock status', error);
        return false;
      }

      return data?.is_locked === true;
    } catch (error) {
      this.log.error('Account lock check error', error);
      return false;
    }
  }
}

// ============================================
// Layer 2: Authorization
// ============================================

/**
 * Layer 2: Authorization - Validates WHAT the user can do
 */
export class AuthorizationLayer {
  private static instance: AuthorizationLayer;
  private log = logger.withContext('AuthzLayer');
  private permissionCache: Map<string, { permissions: string[]; timestamp: number }> = new Map();
  private roleLevelCache: Map<string, { level: number; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  static getInstance(): AuthorizationLayer {
    if (!AuthorizationLayer.instance) {
      AuthorizationLayer.instance = new AuthorizationLayer();
    }
    return AuthorizationLayer.instance;
  }

  /**
   * Get user's role level (with caching)
   */
  async getRoleLevel(userId: string): Promise<number> {
    // Check cache
    const cached = this.roleLevelCache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.level;
    }

    try {
      const { data, error } = await supabase.rpc('get_user_role_level', {
        _user_id: userId,
      });

      if (error) {
        this.log.error('Error getting role level', error);
        return 0;
      }

      const level = data || 0;

      // Cache result
      this.roleLevelCache.set(userId, { level, timestamp: Date.now() });

      return level;
    } catch (error) {
      this.log.error('Role level fetch error', error);
      return 0;
    }
  }

  /**
   * Get user's permissions (with caching)
   */
  async getPermissions(userId: string): Promise<string[]> {
    // Check cache
    const cached = this.permissionCache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.permissions;
    }

    try {
      const { data, error } = await supabase.rpc('get_user_permissions', {
        _user_id: userId,
      });

      if (error) {
        this.log.error('Error getting permissions', error);
        return [];
      }

      const permissions = data || [];

      // Cache result
      this.permissionCache.set(userId, { permissions, timestamp: Date.now() });

      return permissions;
    } catch (error) {
      this.log.error('Permissions fetch error', error);
      return [];
    }
  }

  /**
   * Check if user has minimum role level
   */
  async hasRoleLevel(userId: string, minLevel: number): Promise<boolean> {
    const level = await this.getRoleLevel(userId);
    return level >= minLevel;
  }

  /**
   * Check if user has a specific permission
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const permissions = await this.getPermissions(userId);
    return permissions.includes(permission);
  }

  /**
   * Check if user has any of the specified permissions
   */
  async hasAnyPermission(userId: string, permissionsToCheck: string[]): Promise<boolean> {
    const permissions = await this.getPermissions(userId);
    return permissionsToCheck.some((p) => permissions.includes(p));
  }

  /**
   * Check if user has all of the specified permissions
   */
  async hasAllPermissions(userId: string, permissionsToCheck: string[]): Promise<boolean> {
    const permissions = await this.getPermissions(userId);
    return permissionsToCheck.every((p) => permissions.includes(p));
  }

  /**
   * Require a specific permission, throw if not granted
   */
  async requirePermission(
    userId: string,
    permission: string,
    options: PermissionCheckOptions = {}
  ): Promise<void> {
    const hasPermission = await this.hasPermission(userId, permission);

    if (!hasPermission) {
      // Log the denial
      if (options.logDenial !== false) {
        await this.logPermissionDenial(userId, permission, options);
      }

      throw new AuthorizationError(`Permission denied: ${permission}`);
    }
  }

  /**
   * Require minimum role level, throw if not met
   */
  async requireRoleLevel(userId: string, minLevel: number): Promise<void> {
    const hasLevel = await this.hasRoleLevel(userId, minLevel);

    if (!hasLevel) {
      await securityAudit.logAccess('PERMISSION_DENIED', userId, {
        reason: 'insufficient_role_level',
        requiredLevel: minLevel,
        layer: 'authorization',
      });

      throw new AuthorizationError(`Insufficient role level. Required: ${minLevel}`);
    }
  }

  /**
   * Log permission denial for audit trail
   */
  private async logPermissionDenial(
    userId: string,
    permission: string,
    options: PermissionCheckOptions
  ): Promise<void> {
    try {
      await supabase.from('permission_denials').insert({
        user_id: userId,
        permission_required: permission,
        resource_type: options.resourceType,
        resource_id: options.resourceId,
        reason: 'permission_not_granted',
        metadata: {},
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });

      await securityAudit.logAccess('PERMISSION_DENIED', userId, {
        permission,
        resourceType: options.resourceType,
        resourceId: options.resourceId,
        layer: 'authorization',
      });
    } catch (error) {
      this.log.error('Failed to log permission denial', error);
    }
  }

  /**
   * Clear cache for a user (call after role/permission changes)
   */
  clearCache(userId?: string): void {
    if (userId) {
      this.permissionCache.delete(userId);
      this.roleLevelCache.delete(userId);
    } else {
      this.permissionCache.clear();
      this.roleLevelCache.clear();
    }
  }
}

// ============================================
// Layer 3: Resource Ownership
// ============================================

/**
 * Layer 3: Resource Ownership - Validates IS this resource yours?
 */
export class OwnershipLayer {
  private static instance: OwnershipLayer;
  private log = logger.withContext('OwnerLayer');

  static getInstance(): OwnershipLayer {
    if (!OwnershipLayer.instance) {
      OwnershipLayer.instance = new OwnershipLayer();
    }
    return OwnershipLayer.instance;
  }

  /**
   * Get user's household ID
   */
  async getHouseholdId(userId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('household_id')
        .eq('id', userId)
        .single();

      if (error) {
        this.log.error('Error getting household ID', error);
        return null;
      }

      return data?.household_id || null;
    } catch (error) {
      this.log.error('Household ID fetch error', error);
      return null;
    }
  }

  /**
   * Check if user owns a resource (by user_id)
   */
  isOwner(userId: string, resourceUserId: string | null | undefined): boolean {
    if (!resourceUserId) return false;
    return userId === resourceUserId;
  }

  /**
   * Check if resource belongs to user's household
   */
  async isHouseholdResource(
    userId: string,
    resourceHouseholdId: string | null | undefined
  ): Promise<boolean> {
    if (!resourceHouseholdId) return false;

    const userHouseholdId = await this.getHouseholdId(userId);
    if (!userHouseholdId) return false;

    return userHouseholdId === resourceHouseholdId;
  }

  /**
   * Check if two users are in the same household
   */
  async isSameHousehold(userId1: string, userId2: string): Promise<boolean> {
    if (userId1 === userId2) return true;

    const [household1, household2] = await Promise.all([
      this.getHouseholdId(userId1),
      this.getHouseholdId(userId2),
    ]);

    return household1 !== null && household1 === household2;
  }

  /**
   * Comprehensive ownership check combining multiple criteria
   */
  async canAccessResource(
    userId: string,
    resource: { user_id?: string | null; household_id?: string | null },
    options: OwnershipCheckOptions = {}
  ): Promise<SecurityCheckResult> {
    const {
      allowHousehold = false,
      allowAdmin = true,
    } = options;

    // Check if user is admin (bypass ownership)
    if (allowAdmin) {
      const authzLayer = AuthorizationLayer.getInstance();
      const isAdmin = await authzLayer.hasRoleLevel(userId, RoleLevels.ADMIN);
      if (isAdmin) {
        return { allowed: true, reason: 'admin_bypass', layer: 'ownership' };
      }
    }

    // Check direct ownership
    if (resource.user_id && this.isOwner(userId, resource.user_id)) {
      return { allowed: true, reason: 'owner', layer: 'ownership' };
    }

    // Check household access
    if (allowHousehold && resource.household_id) {
      const isHousehold = await this.isHouseholdResource(userId, resource.household_id);
      if (isHousehold) {
        return { allowed: true, reason: 'household_member', layer: 'ownership' };
      }
    }

    // Log denial
    await securityAudit.logAccess('PERMISSION_DENIED', userId, {
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      resourceUserId: resource.user_id,
      resourceHouseholdId: resource.household_id,
      reason: 'not_owner',
      layer: 'ownership',
    });

    return { allowed: false, reason: 'not_owner', layer: 'ownership' };
  }

  /**
   * Require ownership of a resource, throw if not owner
   */
  async requireOwnership(
    userId: string,
    resource: { user_id?: string | null; household_id?: string | null },
    options: OwnershipCheckOptions = {}
  ): Promise<void> {
    const result = await this.canAccessResource(userId, resource, options);

    if (!result.allowed) {
      throw new OwnershipError('You do not have access to this resource');
    }
  }
}

// ============================================
// Combined Security Context
// ============================================

/**
 * Combined security layers manager
 */
export class SecurityLayers {
  private static instance: SecurityLayers;

  readonly auth = AuthenticationLayer.getInstance();
  readonly authz = AuthorizationLayer.getInstance();
  readonly ownership = OwnershipLayer.getInstance();

  private log = logger.withContext('SecurityLayers');

  static getInstance(): SecurityLayers {
    if (!SecurityLayers.instance) {
      SecurityLayers.instance = new SecurityLayers();
    }
    return SecurityLayers.instance;
  }

  /**
   * Build complete security context for current user
   */
  async buildContext(): Promise<SecurityContext> {
    const session = await this.auth.validateSession();

    if (!session.valid || !session.userId) {
      return {
        userId: null,
        sessionId: null,
        householdId: null,
        roleLevel: 0,
        permissions: [],
        roles: [],
        isAuthenticated: false,
        isAdmin: false,
        isModerator: false,
      };
    }

    const [roleLevel, permissions, householdId] = await Promise.all([
      this.authz.getRoleLevel(session.userId),
      this.authz.getPermissions(session.userId),
      this.ownership.getHouseholdId(session.userId),
    ]);

    // Determine roles from level
    const roles: RoleName[] = ['user'];
    if (roleLevel >= RoleLevels.MODERATOR) roles.push('moderator');
    if (roleLevel >= RoleLevels.ADMIN) roles.push('admin');

    return {
      userId: session.userId,
      sessionId: session.sessionId,
      householdId,
      roleLevel,
      permissions,
      roles,
      isAuthenticated: true,
      isAdmin: roleLevel >= RoleLevels.ADMIN,
      isModerator: roleLevel >= RoleLevels.MODERATOR,
    };
  }

  /**
   * Comprehensive access check through all layers
   */
  async checkAccess(
    permission: string,
    resource?: { user_id?: string | null; household_id?: string | null },
    options: PermissionCheckOptions & OwnershipCheckOptions = {}
  ): Promise<SecurityCheckResult> {
    // Layer 1: Authentication
    const session = await this.auth.validateSession();
    if (!session.valid || !session.userId) {
      return { allowed: false, reason: 'not_authenticated', layer: 'authentication' };
    }

    // Check account lock
    const isLocked = await this.auth.isAccountLocked(session.userId);
    if (isLocked) {
      return { allowed: false, reason: 'account_locked', layer: 'authentication' };
    }

    // Layer 2: Authorization - Check permission
    const hasPermission = await this.authz.hasPermission(session.userId, permission);
    if (!hasPermission) {
      if (options.logDenial !== false) {
        await securityAudit.logAccess('PERMISSION_DENIED', session.userId, {
          permission,
          layer: 'authorization',
        });
      }
      return { allowed: false, reason: `missing_permission:${permission}`, layer: 'authorization' };
    }

    // Layer 3: Ownership (if resource provided)
    if (resource) {
      const ownershipResult = await this.ownership.canAccessResource(
        session.userId,
        resource,
        options
      );
      if (!ownershipResult.allowed) {
        return ownershipResult;
      }
    }

    // All checks passed
    return { allowed: true, layer: 'rls' };
  }

  /**
   * Enforce access through all layers, throw on failure
   */
  async enforceAccess(
    permission: string,
    resource?: { user_id?: string | null; household_id?: string | null },
    options: PermissionCheckOptions & OwnershipCheckOptions = {}
  ): Promise<{ userId: string; sessionId: string }> {
    const result = await this.checkAccess(permission, resource, options);

    if (!result.allowed) {
      switch (result.layer) {
        case 'authentication':
          throw new AuthenticationError(result.reason || 'Authentication required');
        case 'authorization':
          throw new AuthorizationError(result.reason || 'Permission denied');
        case 'ownership':
          throw new OwnershipError(result.reason || 'Access denied');
        default:
          throw new SecurityError(result.reason || 'Access denied');
      }
    }

    const session = await this.auth.validateSession();
    return { userId: session.userId!, sessionId: session.sessionId! };
  }
}

// ============================================
// Custom Error Classes
// ============================================

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

export class AuthenticationError extends SecurityError {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends SecurityError {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class OwnershipError extends SecurityError {
  constructor(message: string) {
    super(message);
    this.name = 'OwnershipError';
  }
}

// ============================================
// Singleton Exports
// ============================================

export const securityLayers = SecurityLayers.getInstance();
export const authLayer = AuthenticationLayer.getInstance();
export const authzLayer = AuthorizationLayer.getInstance();
export const ownershipLayer = OwnershipLayer.getInstance();
