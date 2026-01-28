/**
 * Security Components
 *
 * Defense-in-depth security components for route and content protection.
 */

export {
  // Route Protection Components
  AuthenticatedRoute,
  PermissionRoute,
  RoleLevelRoute,
  AdminRoute,
  ModeratorRoute,
  SecureRoute,

  // Conditional Rendering Components
  ShowIfPermitted,
  ShowIfRoleLevel,
  AdminOnly,
  ModeratorOnly,
  ShowIfOwner,

  // UI Components
  SecurityLoading,
  AccessDenied,
  AuthenticationRequired,
  PermissionDenied,
  OwnershipDenied,

  // Constants
  RoleLevels,
} from './SecureRoute';
