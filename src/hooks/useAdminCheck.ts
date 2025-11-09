import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

export const useAdminCheck = () => {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          console.log("No user found - redirecting to auth");
          toast({
            title: "Access Denied",
            description: "You must be logged in to access this page.",
            variant: "destructive",
          });
          navigate("/auth?redirect=/admin");
          return;
        }

        console.log("Checking admin status for user:", user.id);

        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (error) {
          console.error("Error checking admin status:", error);
          toast({
            title: "Error",
            description: "Failed to verify admin permissions. Please try again.",
            variant: "destructive",
          });
          setIsAdmin(false);
          navigate("/");
        } else {
          console.log("Admin check result:", data);
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
      } catch (error) {
        console.error("Error in admin check:", error);
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
