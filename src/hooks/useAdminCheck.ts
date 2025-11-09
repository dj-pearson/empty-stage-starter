import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

/**
 * useAdminCheck - Hook for verifying admin role permissions
 *
 * NOTE: This hook assumes the user is already authenticated.
 * Admin routes should be wrapped with ProtectedRoute component
 * which handles authentication before this hook runs.
 *
 * This hook only checks for admin role in user_roles table.
 */
export const useAdminCheck = () => {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        console.log('[useAdminCheck] Starting admin role check...');
        const { data: { user } } = await supabase.auth.getUser();

        console.log('[useAdminCheck] User from auth:', user);

        // ProtectedRoute ensures user exists, but double-check for safety
        if (!user) {
          console.log("[useAdminCheck] No user found - this should not happen with ProtectedRoute");
          toast({
            title: "Access Denied",
            description: "Authentication required.",
            variant: "destructive",
          });
          navigate("/");
          return;
        }

        console.log("[useAdminCheck] Checking admin role for user:", user.id);

        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        console.log('[useAdminCheck] Query result - data:', data, 'error:', error);

        if (error) {
          console.error("[useAdminCheck] Error checking admin status:", error);
          toast({
            title: "Error",
            description: "Failed to verify admin permissions. Please try again.",
            variant: "destructive",
          });
          setIsAdmin(false);
          navigate("/");
        } else {
          console.log("[useAdminCheck] Admin check result:", data);
          console.log("[useAdminCheck] Is admin?:", !!data);
          setIsAdmin(!!data);

          if (!data) {
            console.log("[useAdminCheck] No admin role found - redirecting to home");
            toast({
              title: "Access Denied",
              description: "You don't have admin permissions.",
              variant: "destructive",
            });
            navigate("/");
          } else {
            console.log("[useAdminCheck] Admin access GRANTED!");
          }
        }
      } catch (error) {
        console.error("[useAdminCheck] Caught exception:", error);
        setIsAdmin(false);
        navigate("/");
      } finally {
        console.log('[useAdminCheck] Setting isLoading to false');
        setIsLoading(false);
      }
    };

    checkAdminStatus();
  }, [navigate]);


  return { isAdmin, isLoading };
};
