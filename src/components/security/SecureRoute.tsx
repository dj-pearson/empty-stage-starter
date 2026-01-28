/**
 * Secure Route Components
 *
 * Higher-level route protection components that implement
 * defense-in-depth security through multiple layers.
 *
 * Usage:
 * ```tsx
 * // Layer 1 only - require authentication
 * <AuthenticatedRoute>
 *   <Dashboard />
 * </AuthenticatedRoute>
 *
 * // Layer 1 + 2 - require auth + permission
 * <PermissionRoute permission="admin.dashboard">
 *   <AdminDashboard />
 * </PermissionRoute>
 *
 * // Layer 1 + 2 - require auth + role level
 * <RoleLevelRoute minLevel={RoleLevels.ADMIN}>
 *   <AdminPanel />
 * </RoleLevelRoute>
 *
 * // All layers - require auth + permission + ownership
 * <SecureRoute
 *   permission="food.view_own"
 *   resource={{ user_id: foodItem.user_id }}
 * >
 *   <FoodDetail />
 * </SecureRoute>
 * ```
 */

import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, ShieldAlert, Lock, UserX } from 'lucide-react';
import {
  useSecurityContext,
  useRequireAuth,
  useRequirePermission,
  useRequireRoleLevel,
  useSecureAccess,
} from '@/hooks/useSecurityLayers';
import { RoleLevels } from '@/lib/security-layers';
import { cn } from '@/lib/utils';

// ============================================
// Loading Component
// ============================================

interface SecurityLoadingProps {
  message?: string;
  className?: string;
}

function SecurityLoading({ message = 'Verifying access...', className }: SecurityLoadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center min-h-[200px] gap-3',
        className
      )}
      role="status"
      aria-busy="true"
      aria-label={message}
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground animate-pulse">{message}</p>
      <span className="sr-only">{message}</span>
    </div>
  );
}

// ============================================
// Access Denied Components
// ============================================

interface AccessDeniedProps {
  title?: string;
  message?: string;
  icon?: ReactNode;
  showHomeLink?: boolean;
  className?: string;
}

function AccessDenied({
  title = 'Access Denied',
  message = 'You do not have permission to view this page.',
  icon,
  showHomeLink = true,
  className,
}: AccessDeniedProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center min-h-[300px] gap-4 p-6 text-center',
        className
      )}
      role="alert"
      aria-live="polite"
    >
      {icon || <ShieldAlert className="h-12 w-12 text-destructive" aria-hidden="true" />}
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="text-muted-foreground max-w-md">{message}</p>
      {showHomeLink && (
        <a
          href="/"
          className="text-primary hover:underline mt-2"
        >
          Return to Home
        </a>
      )}
    </div>
  );
}

function AuthenticationRequired({ className }: { className?: string }) {
  return (
    <AccessDenied
      title="Authentication Required"
      message="Please sign in to access this page."
      icon={<Lock className="h-12 w-12 text-muted-foreground" aria-hidden="true" />}
      showHomeLink={false}
      className={className}
    />
  );
}

function PermissionDenied({ permission, className }: { permission?: string; className?: string }) {
  return (
    <AccessDenied
      title="Permission Denied"
      message={
        permission
          ? `You do not have the required permission (${permission}) to access this feature.`
          : 'You do not have permission to access this feature.'
      }
      icon={<ShieldAlert className="h-12 w-12 text-destructive" aria-hidden="true" />}
      className={className}
    />
  );
}

function OwnershipDenied({ className }: { className?: string }) {
  return (
    <AccessDenied
      title="Not Your Resource"
      message="You can only access resources that belong to you or your household."
      icon={<UserX className="h-12 w-12 text-destructive" aria-hidden="true" />}
      className={className}
    />
  );
}

// ============================================
// Layer 1: Authenticated Route
// ============================================

interface AuthenticatedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
  loadingComponent?: ReactNode;
}

/**
 * Layer 1: Requires user to be authenticated
 */
export function AuthenticatedRoute({
  children,
  fallback,
  redirectTo = '/auth',
  loadingComponent,
}: AuthenticatedRouteProps) {
  const location = useLocation();
  const { context, isLoading } = useSecurityContext();

  if (isLoading) {
    return loadingComponent || <SecurityLoading message="Verifying authentication..." />;
  }

  if (!context.isAuthenticated) {
    if (fallback) {
      return <>{fallback}</>;
    }

    // Redirect with return URL
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    const authUrl = `${redirectTo}?redirect=${encodeURIComponent(redirectPath)}`;
    return <Navigate to={authUrl} replace />;
  }

  return <>{children}</>;
}

// ============================================
// Layer 2: Permission Route
// ============================================

interface PermissionRouteProps {
  children: ReactNode;
  permission: string;
  fallback?: ReactNode;
  redirectTo?: string;
  loadingComponent?: ReactNode;
  showDeniedUI?: boolean;
}

/**
 * Layer 1 + 2: Requires authentication AND specific permission
 */
export function PermissionRoute({
  children,
  permission,
  fallback,
  redirectTo,
  loadingComponent,
  showDeniedUI = true,
}: PermissionRouteProps) {
  const location = useLocation();
  const { context, isLoading, checkPermission } = useSecurityContext();

  if (isLoading) {
    return loadingComponent || <SecurityLoading message="Verifying permissions..." />;
  }

  // Layer 1: Check authentication
  if (!context.isAuthenticated) {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/auth?redirect=${encodeURIComponent(redirectPath)}`} replace />;
  }

  // Layer 2: Check permission
  const hasPermission = checkPermission(permission);

  if (!hasPermission) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }

    if (showDeniedUI) {
      return <PermissionDenied permission={permission} />;
    }

    return null;
  }

  return <>{children}</>;
}

// ============================================
// Layer 2: Role Level Route
// ============================================

interface RoleLevelRouteProps {
  children: ReactNode;
  minLevel: number;
  fallback?: ReactNode;
  redirectTo?: string;
  loadingComponent?: ReactNode;
  showDeniedUI?: boolean;
}

/**
 * Layer 1 + 2: Requires authentication AND minimum role level
 */
export function RoleLevelRoute({
  children,
  minLevel,
  fallback,
  redirectTo = '/',
  loadingComponent,
  showDeniedUI = true,
}: RoleLevelRouteProps) {
  const location = useLocation();
  const { context, isLoading, checkRoleLevel } = useSecurityContext();

  if (isLoading) {
    return loadingComponent || <SecurityLoading message="Verifying access level..." />;
  }

  // Layer 1: Check authentication
  if (!context.isAuthenticated) {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/auth?redirect=${encodeURIComponent(redirectPath)}`} replace />;
  }

  // Layer 2: Check role level
  const hasLevel = checkRoleLevel(minLevel);

  if (!hasLevel) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }

    if (showDeniedUI) {
      return (
        <AccessDenied
          title="Insufficient Privileges"
          message={`This page requires ${
            minLevel >= RoleLevels.ADMIN
              ? 'administrator'
              : minLevel >= RoleLevels.MODERATOR
              ? 'moderator'
              : 'elevated'
          } access.`}
        />
      );
    }

    return null;
  }

  return <>{children}</>;
}

/**
 * Shortcut: Admin-only route
 */
export function AdminRoute({
  children,
  ...props
}: Omit<RoleLevelRouteProps, 'minLevel'>) {
  return (
    <RoleLevelRoute minLevel={RoleLevels.ADMIN} {...props}>
      {children}
    </RoleLevelRoute>
  );
}

/**
 * Shortcut: Moderator+ route
 */
export function ModeratorRoute({
  children,
  ...props
}: Omit<RoleLevelRouteProps, 'minLevel'>) {
  return (
    <RoleLevelRoute minLevel={RoleLevels.MODERATOR} {...props}>
      {children}
    </RoleLevelRoute>
  );
}

// ============================================
// All Layers: Secure Route
// ============================================

interface SecureRouteProps {
  children: ReactNode;
  permission: string;
  resource?: { user_id?: string | null; household_id?: string | null } | null;
  allowHousehold?: boolean;
  fallback?: ReactNode;
  redirectTo?: string;
  loadingComponent?: ReactNode;
  showDeniedUI?: boolean;
}

/**
 * All Layers: Full defense-in-depth protection
 * - Layer 1: Authentication
 * - Layer 2: Authorization (permission)
 * - Layer 3: Ownership (if resource provided)
 * - Layer 4: RLS enforced at database level
 */
export function SecureRoute({
  children,
  permission,
  resource,
  allowHousehold = true,
  fallback,
  redirectTo,
  loadingComponent,
  showDeniedUI = true,
}: SecureRouteProps) {
  const location = useLocation();
  const { isAllowed, isLoading, result, context } = useSecureAccess(
    permission,
    resource,
    {
      allowHousehold,
      showToasts: false, // We handle UI ourselves
    }
  );

  if (isLoading) {
    return loadingComponent || <SecurityLoading message="Verifying secure access..." />;
  }

  if (!isAllowed) {
    if (fallback) {
      return <>{fallback}</>;
    }

    // Determine which layer failed
    const layer = result?.layer;

    if (layer === 'authentication') {
      const redirectPath = `${location.pathname}${location.search}${location.hash}`;
      return <Navigate to={`/auth?redirect=${encodeURIComponent(redirectPath)}`} replace />;
    }

    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }

    if (showDeniedUI) {
      if (layer === 'authorization') {
        return <PermissionDenied permission={permission} />;
      }
      if (layer === 'ownership') {
        return <OwnershipDenied />;
      }
      return <AccessDenied />;
    }

    return null;
  }

  return <>{children}</>;
}

// ============================================
// Conditional Rendering Components
// ============================================

interface ShowIfPermittedProps {
  children: ReactNode;
  permission: string;
  fallback?: ReactNode;
}

/**
 * Conditionally render children if user has permission
 * Does NOT redirect - just hides content
 */
export function ShowIfPermitted({
  children,
  permission,
  fallback = null,
}: ShowIfPermittedProps) {
  const { isLoading, checkPermission, context } = useSecurityContext();

  if (isLoading) {
    return null;
  }

  if (!context.isAuthenticated || !checkPermission(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

interface ShowIfRoleLevelProps {
  children: ReactNode;
  minLevel: number;
  fallback?: ReactNode;
}

/**
 * Conditionally render children if user has minimum role level
 */
export function ShowIfRoleLevel({
  children,
  minLevel,
  fallback = null,
}: ShowIfRoleLevelProps) {
  const { isLoading, checkRoleLevel, context } = useSecurityContext();

  if (isLoading) {
    return null;
  }

  if (!context.isAuthenticated || !checkRoleLevel(minLevel)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Show content only to admins
 */
export function AdminOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <ShowIfRoleLevel minLevel={RoleLevels.ADMIN} fallback={fallback}>
      {children}
    </ShowIfRoleLevel>
  );
}

/**
 * Show content only to moderators+
 */
export function ModeratorOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <ShowIfRoleLevel minLevel={RoleLevels.MODERATOR} fallback={fallback}>
      {children}
    </ShowIfRoleLevel>
  );
}

interface ShowIfOwnerProps {
  children: ReactNode;
  resource: { user_id?: string | null; household_id?: string | null } | null;
  allowHousehold?: boolean;
  fallback?: ReactNode;
}

/**
 * Conditionally render children if user owns the resource
 */
export function ShowIfOwner({
  children,
  resource,
  allowHousehold = true,
  fallback = null,
}: ShowIfOwnerProps) {
  const { context, isLoading } = useSecurityContext();
  const [canAccess, setCanAccess] = useState(false);

  useEffect(() => {
    if (isLoading || !resource) return;

    const isOwner = context.userId === resource.user_id;
    const isHouseholdMatch = allowHousehold &&
      context.householdId &&
      context.householdId === resource.household_id;

    setCanAccess(context.isAdmin || isOwner || !!isHouseholdMatch);
  }, [isLoading, context, resource, allowHousehold]);

  if (isLoading) {
    return null;
  }

  if (!context.isAuthenticated || !canAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// ============================================
// Exports
// ============================================

export {
  SecurityLoading,
  AccessDenied,
  AuthenticationRequired,
  PermissionDenied,
  OwnershipDenied,
};

export { RoleLevels };
