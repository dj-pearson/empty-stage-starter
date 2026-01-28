/**
 * Security Layers Hooks
 *
 * React hooks for implementing defense-in-depth security in components.
 *
 * Usage:
 * ```typescript
 * import { useSecurityContext, useRequireAuth, useRequirePermission } from '@/hooks/useSecurityLayers';
 *
 * function MyComponent() {
 *   // Get full security context
 *   const { context, isLoading, checkPermission, checkOwnership } = useSecurityContext();
 *
 *   // Or use specific requirement hooks
 *   const { isAuthorized, isLoading } = useRequirePermission('food.view_own');
 *
 *   if (isLoading) return <Spinner />;
 *   if (!isAuthorized) return <AccessDenied />;
 *
 *   return <MyProtectedContent />;
 * }
 * ```
 */

import { useState, useEffect, useCallback, useMemo, createContext, useContext, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  securityLayers,
  SecurityContext,
  SecurityCheckResult,
  RoleLevels,
  Permission,
  AuthenticationError,
  AuthorizationError,
  OwnershipError,
} from '@/lib/security-layers';
import { securityAudit } from '@/lib/security-audit';
import { logger } from '@/lib/logger';

const log = logger.withContext('SecurityHooks');

// ============================================
// Security Context Provider
// ============================================

interface SecurityContextValue {
  context: SecurityContext;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  checkPermission: (permission: string) => boolean;
  checkRoleLevel: (minLevel: number) => boolean;
  checkOwnership: (resource: { user_id?: string | null; household_id?: string | null }) => Promise<boolean>;
  enforceAccess: (
    permission: string,
    resource?: { user_id?: string | null; household_id?: string | null }
  ) => Promise<SecurityCheckResult>;
}

const defaultContext: SecurityContext = {
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

const SecurityContextReact = createContext<SecurityContextValue>({
  context: defaultContext,
  isLoading: true,
  error: null,
  refresh: async () => {},
  checkPermission: () => false,
  checkRoleLevel: () => false,
  checkOwnership: async () => false,
  enforceAccess: async () => ({ allowed: false, reason: 'not_initialized' }),
});

/**
 * Security Provider Component
 */
export function SecurityProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<SecurityContext>(defaultContext);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const newContext = await securityLayers.buildContext();
      setContext(newContext);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to build security context');
      log.error('Security context refresh failed', error);
      setError(error);
      setContext(defaultContext);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Check permission synchronously using cached context
  const checkPermission = useCallback(
    (permission: string): boolean => {
      return context.permissions.includes(permission);
    },
    [context.permissions]
  );

  // Check role level synchronously using cached context
  const checkRoleLevel = useCallback(
    (minLevel: number): boolean => {
      return context.roleLevel >= minLevel;
    },
    [context.roleLevel]
  );

  // Check ownership (async as it may need DB lookup)
  const checkOwnership = useCallback(
    async (resource: { user_id?: string | null; household_id?: string | null }): Promise<boolean> => {
      if (!context.userId) return false;

      const result = await securityLayers.ownership.canAccessResource(context.userId, resource, {
        allowHousehold: true,
        allowAdmin: true,
      });

      return result.allowed;
    },
    [context.userId]
  );

  // Full access enforcement
  const enforceAccess = useCallback(
    async (
      permission: string,
      resource?: { user_id?: string | null; household_id?: string | null }
    ): Promise<SecurityCheckResult> => {
      return securityLayers.checkAccess(permission, resource);
    },
    []
  );

  const value = useMemo(
    () => ({
      context,
      isLoading,
      error,
      refresh,
      checkPermission,
      checkRoleLevel,
      checkOwnership,
      enforceAccess,
    }),
    [context, isLoading, error, refresh, checkPermission, checkRoleLevel, checkOwnership, enforceAccess]
  );

  return (
    <SecurityContextReact.Provider value={value}>
      {children}
    </SecurityContextReact.Provider>
  );
}

/**
 * Hook to access security context
 */
export function useSecurityContext() {
  const context = useContext(SecurityContextReact);
  if (!context) {
    throw new Error('useSecurityContext must be used within SecurityProvider');
  }
  return context;
}

// ============================================
// Layer 1: Authentication Hooks
// ============================================

/**
 * Hook for Layer 1: Require authentication
 * Returns loading state while checking, then redirects or allows
 */
export function useRequireAuth(options: {
  redirectTo?: string;
  showToast?: boolean;
} = {}) {
  const { redirectTo = '/auth', showToast = true } = options;
  const { context, isLoading, refresh } = useSecurityContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !context.isAuthenticated) {
      if (showToast) {
        toast.error('Please sign in to continue');
      }

      // Log the auth requirement
      securityAudit.logAuth('SESSION_EXPIRED', null, {
        layer: 'authentication',
        redirectTo,
      }, false);

      // Save intended destination
      const currentPath = window.location.pathname + window.location.search;
      navigate(`${redirectTo}?redirect=${encodeURIComponent(currentPath)}`);
    }
  }, [isLoading, context.isAuthenticated, navigate, redirectTo, showToast]);

  return {
    isAuthenticated: context.isAuthenticated,
    isLoading,
    userId: context.userId,
    sessionId: context.sessionId,
    refresh,
  };
}

/**
 * Hook to get current user ID (must be authenticated)
 */
export function useCurrentUser() {
  const { context, isLoading } = useSecurityContext();

  return {
    userId: context.userId,
    householdId: context.householdId,
    isAuthenticated: context.isAuthenticated,
    isAdmin: context.isAdmin,
    isModerator: context.isModerator,
    roleLevel: context.roleLevel,
    isLoading,
  };
}

// ============================================
// Layer 2: Authorization Hooks
// ============================================

/**
 * Hook for Layer 2: Require specific permission
 */
export function useRequirePermission(
  permission: string,
  options: {
    redirectTo?: string;
    showToast?: boolean;
    onDenied?: () => void;
  } = {}
) {
  const { redirectTo, showToast = true, onDenied } = options;
  const { context, isLoading, checkPermission } = useSecurityContext();
  const navigate = useNavigate();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (isLoading) return;

    const hasPermission = checkPermission(permission);
    setIsAuthorized(hasPermission);

    if (!hasPermission && context.isAuthenticated) {
      if (showToast) {
        toast.error('You do not have permission to access this feature');
      }

      // Log the denial
      if (context.userId) {
        securityAudit.logAccess('PERMISSION_DENIED', context.userId, {
          permission,
          layer: 'authorization',
        });
      }

      if (onDenied) {
        onDenied();
      } else if (redirectTo) {
        navigate(redirectTo);
      }
    }
  }, [isLoading, context.isAuthenticated, context.userId, permission, checkPermission, navigate, redirectTo, showToast, onDenied]);

  return {
    isAuthorized: isAuthorized === true,
    isLoading: isLoading || isAuthorized === null,
    permissions: context.permissions,
    hasPermission: checkPermission,
  };
}

/**
 * Hook for Layer 2: Require minimum role level
 */
export function useRequireRoleLevel(
  minLevel: number,
  options: {
    redirectTo?: string;
    showToast?: boolean;
    onDenied?: () => void;
  } = {}
) {
  const { redirectTo = '/', showToast = true, onDenied } = options;
  const { context, isLoading, checkRoleLevel } = useSecurityContext();
  const navigate = useNavigate();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (isLoading) return;

    const hasLevel = checkRoleLevel(minLevel);
    setIsAuthorized(hasLevel);

    if (!hasLevel && context.isAuthenticated) {
      if (showToast) {
        toast.error('You do not have sufficient privileges');
      }

      // Log the denial
      if (context.userId) {
        securityAudit.logAccess('PERMISSION_DENIED', context.userId, {
          requiredLevel: minLevel,
          actualLevel: context.roleLevel,
          layer: 'authorization',
        });
      }

      if (onDenied) {
        onDenied();
      } else {
        navigate(redirectTo);
      }
    }
  }, [isLoading, context.isAuthenticated, context.userId, context.roleLevel, minLevel, checkRoleLevel, navigate, redirectTo, showToast, onDenied]);

  return {
    isAuthorized: isAuthorized === true,
    isLoading: isLoading || isAuthorized === null,
    roleLevel: context.roleLevel,
    hasRoleLevel: checkRoleLevel,
  };
}

/**
 * Hook for admin-only access
 */
export function useRequireAdmin(options: {
  redirectTo?: string;
  showToast?: boolean;
  onDenied?: () => void;
} = {}) {
  return useRequireRoleLevel(RoleLevels.ADMIN, {
    redirectTo: options.redirectTo || '/',
    showToast: options.showToast,
    onDenied: options.onDenied,
  });
}

/**
 * Hook for moderator+ access
 */
export function useRequireModerator(options: {
  redirectTo?: string;
  showToast?: boolean;
  onDenied?: () => void;
} = {}) {
  return useRequireRoleLevel(RoleLevels.MODERATOR, {
    redirectTo: options.redirectTo || '/',
    showToast: options.showToast,
    onDenied: options.onDenied,
  });
}

// ============================================
// Layer 3: Ownership Hooks
// ============================================

/**
 * Hook for Layer 3: Check resource ownership
 */
export function useResourceOwnership(resource: {
  user_id?: string | null;
  household_id?: string | null;
} | null) {
  const { context, isLoading: contextLoading, checkOwnership } = useSecurityContext();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [isHouseholdMember, setIsHouseholdMember] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (contextLoading || !resource) {
      setIsLoading(true);
      return;
    }

    const checkAccess = async () => {
      setIsLoading(true);

      // Direct ownership check
      const ownerCheck = context.userId === resource.user_id;
      setIsOwner(ownerCheck);

      // Household membership check
      if (resource.household_id && context.householdId) {
        setIsHouseholdMember(context.householdId === resource.household_id);
      } else {
        setIsHouseholdMember(false);
      }

      setIsLoading(false);
    };

    checkAccess();
  }, [contextLoading, context.userId, context.householdId, resource]);

  const canAccess = useMemo(() => {
    if (context.isAdmin) return true;
    if (isOwner) return true;
    if (isHouseholdMember) return true;
    return false;
  }, [context.isAdmin, isOwner, isHouseholdMember]);

  return {
    canAccess,
    isOwner: isOwner === true,
    isHouseholdMember: isHouseholdMember === true,
    isAdmin: context.isAdmin,
    isLoading: isLoading || contextLoading,
  };
}

/**
 * Hook for Layer 3: Require resource ownership
 */
export function useRequireOwnership(
  resource: { user_id?: string | null; household_id?: string | null } | null,
  options: {
    allowHousehold?: boolean;
    redirectTo?: string;
    showToast?: boolean;
    onDenied?: () => void;
  } = {}
) {
  const { allowHousehold = true, redirectTo, showToast = true, onDenied } = options;
  const { canAccess, isOwner, isHouseholdMember, isAdmin, isLoading } = useResourceOwnership(resource);
  const { context } = useSecurityContext();
  const navigate = useNavigate();
  const [checkedAccess, setCheckedAccess] = useState(false);

  useEffect(() => {
    if (isLoading || !resource) return;

    const hasAccess = isAdmin || isOwner || (allowHousehold && isHouseholdMember);
    setCheckedAccess(true);

    if (!hasAccess) {
      if (showToast) {
        toast.error('You do not have access to this resource');
      }

      // Log the denial
      if (context.userId) {
        securityAudit.logAccess('PERMISSION_DENIED', context.userId, {
          resourceUserId: resource.user_id,
          resourceHouseholdId: resource.household_id,
          reason: 'not_owner',
          layer: 'ownership',
        });
      }

      if (onDenied) {
        onDenied();
      } else if (redirectTo) {
        navigate(redirectTo);
      }
    }
  }, [isLoading, resource, isAdmin, isOwner, isHouseholdMember, allowHousehold, context.userId, navigate, redirectTo, showToast, onDenied]);

  return {
    canAccess: isAdmin || isOwner || (allowHousehold && isHouseholdMember),
    isOwner,
    isHouseholdMember,
    isAdmin,
    isLoading: isLoading || !checkedAccess,
  };
}

// ============================================
// Combined Multi-Layer Hooks
// ============================================

/**
 * Hook for comprehensive multi-layer security check
 * Combines authentication, authorization, and ownership checks
 */
export function useSecureAccess(
  permission: string,
  resource?: { user_id?: string | null; household_id?: string | null } | null,
  options: {
    allowHousehold?: boolean;
    redirectOnAuthFail?: string;
    redirectOnDenied?: string;
    showToasts?: boolean;
    onDenied?: () => void;
  } = {}
) {
  const {
    allowHousehold = true,
    redirectOnAuthFail = '/auth',
    redirectOnDenied,
    showToasts = true,
    onDenied,
  } = options;

  const { context, isLoading: contextLoading, checkPermission } = useSecurityContext();
  const navigate = useNavigate();

  const [accessResult, setAccessResult] = useState<SecurityCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (contextLoading) return;

    const checkAccess = async () => {
      setIsLoading(true);

      // Layer 1: Authentication
      if (!context.isAuthenticated) {
        setAccessResult({ allowed: false, reason: 'not_authenticated', layer: 'authentication' });
        if (showToasts) {
          toast.error('Please sign in to continue');
        }
        const currentPath = window.location.pathname + window.location.search;
        navigate(`${redirectOnAuthFail}?redirect=${encodeURIComponent(currentPath)}`);
        setIsLoading(false);
        return;
      }

      // Layer 2: Authorization
      const hasPermission = checkPermission(permission);
      if (!hasPermission) {
        setAccessResult({ allowed: false, reason: `missing_permission:${permission}`, layer: 'authorization' });
        if (showToasts) {
          toast.error('You do not have permission to access this feature');
        }
        if (context.userId) {
          securityAudit.logAccess('PERMISSION_DENIED', context.userId, {
            permission,
            layer: 'authorization',
          });
        }
        if (onDenied) {
          onDenied();
        } else if (redirectOnDenied) {
          navigate(redirectOnDenied);
        }
        setIsLoading(false);
        return;
      }

      // Layer 3: Ownership (if resource provided)
      if (resource) {
        const isOwner = context.userId === resource.user_id;
        const isHouseholdMatch = context.householdId && context.householdId === resource.household_id;
        const canAccessResource = context.isAdmin || isOwner || (allowHousehold && isHouseholdMatch);

        if (!canAccessResource) {
          setAccessResult({ allowed: false, reason: 'not_owner', layer: 'ownership' });
          if (showToasts) {
            toast.error('You do not have access to this resource');
          }
          if (context.userId) {
            securityAudit.logAccess('PERMISSION_DENIED', context.userId, {
              permission,
              resourceUserId: resource.user_id,
              resourceHouseholdId: resource.household_id,
              layer: 'ownership',
            });
          }
          if (onDenied) {
            onDenied();
          } else if (redirectOnDenied) {
            navigate(redirectOnDenied);
          }
          setIsLoading(false);
          return;
        }
      }

      // All checks passed
      setAccessResult({ allowed: true });
      setIsLoading(false);
    };

    checkAccess();
  }, [
    contextLoading,
    context.isAuthenticated,
    context.userId,
    context.householdId,
    context.isAdmin,
    permission,
    resource,
    allowHousehold,
    checkPermission,
    navigate,
    redirectOnAuthFail,
    redirectOnDenied,
    showToasts,
    onDenied,
  ]);

  return {
    isAllowed: accessResult?.allowed === true,
    isLoading: isLoading || contextLoading,
    result: accessResult,
    context,
  };
}

// ============================================
// Utility Hooks
// ============================================

/**
 * Hook to check multiple permissions at once
 */
export function usePermissions(permissions: string[]) {
  const { context, isLoading, checkPermission } = useSecurityContext();

  const permissionStatus = useMemo(() => {
    const status: Record<string, boolean> = {};
    for (const perm of permissions) {
      status[perm] = checkPermission(perm);
    }
    return status;
  }, [permissions, checkPermission]);

  const hasAll = useMemo(
    () => permissions.every((p) => permissionStatus[p]),
    [permissions, permissionStatus]
  );

  const hasAny = useMemo(
    () => permissions.some((p) => permissionStatus[p]),
    [permissions, permissionStatus]
  );

  return {
    permissions: permissionStatus,
    hasAll,
    hasAny,
    isLoading,
    allPermissions: context.permissions,
  };
}

/**
 * Hook to handle security errors gracefully
 */
export function useSecurityErrorHandler() {
  const navigate = useNavigate();

  const handleError = useCallback(
    (error: Error, options: { showToast?: boolean; redirect?: string } = {}) => {
      const { showToast = true, redirect } = options;

      if (error instanceof AuthenticationError) {
        if (showToast) {
          toast.error('Session expired. Please sign in again.');
        }
        const currentPath = window.location.pathname + window.location.search;
        navigate(`/auth?redirect=${encodeURIComponent(currentPath)}`);
        return;
      }

      if (error instanceof AuthorizationError) {
        if (showToast) {
          toast.error('You do not have permission to perform this action');
        }
        if (redirect) {
          navigate(redirect);
        }
        return;
      }

      if (error instanceof OwnershipError) {
        if (showToast) {
          toast.error('You do not have access to this resource');
        }
        if (redirect) {
          navigate(redirect);
        }
        return;
      }

      // Generic error
      if (showToast) {
        toast.error('An error occurred. Please try again.');
      }
      log.error('Security error', error);
    },
    [navigate]
  );

  return { handleError };
}

// Export types
export type { SecurityContext, SecurityCheckResult, Permission };
