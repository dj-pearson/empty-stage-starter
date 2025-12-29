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
        const { data: { user } } = await supabase.auth.getUser();

        // ProtectedRoute ensures user exists, but double-check for safety
        if (!user) {
          toast({
            title: "Access Denied",
            description: "Authentication required.",
            variant: "destructive",
          });
          navigate("/");
          return;
        }

        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (error) {
          toast({
            title: "Error",
            description: "Failed to verify admin permissions. Please try again.",
            variant: "destructive",
          });
          setIsAdmin(false);
          navigate("/");
        } else {
          setIsAdmin(!!data);

          if (!data) {
            toast({
              title: "Access Denied",
              description: "You don't have admin permissions.",
              variant: "destructive",
            });
            navigate("/");
          }
        }
      } catch {
        setIsAdmin(false);
        navigate("/");
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminStatus();
  }, [navigate]);


  return { isAdmin, isLoading };
};
