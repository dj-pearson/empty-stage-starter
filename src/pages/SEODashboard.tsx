import { SEOManager } from "@/components/admin/SEOManager";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function SEODashboard() {
  const location = useLocation();

  useEffect(() => {
    // Check if this is an OAuth callback
    const urlParams = new URLSearchParams(location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    if (error) {
      toast.error(`OAuth error: ${error}`);
      return;
    }

    if (code && state) {
      console.log('SEO Dashboard - OAuth callback detected');
      
      // Add immediate popup close attempt for safety
      if (window.opener && window.opener !== window) {
        console.log('SEO Dashboard - Attempting immediate popup close...');
        
        // Try multiple methods to close the popup
        setTimeout(() => {
          try {
            window.opener.postMessage({ 
              type: 'GSC_OAUTH_SUCCESS', 
              code, 
              state 
            }, '*'); // Use wildcard for cross-origin issues
            
            setTimeout(() => window.close(), 50);
          } catch (e) {
            console.error('Immediate close failed:', e);
          }
        }, 100);
      }
      
      // Handle OAuth callback
      handleOAuthCallback(code, state);
    }
  }, [location]);

  const handleOAuthCallback = async (code: string, state: string) => {
    console.log('OAuth callback detected:', { code: code?.substring(0, 10) + '...', state: state?.substring(0, 10) + '...' });
    
    try {
      // Check if this is running in a popup window
      const isPopup = window.opener && window.opener !== window;
      console.log('Is popup window:', isPopup);
      
      if (isPopup) {
        // If this is a popup, communicate with parent and close
        try {
          console.log('Sending message to parent window...');
          
          // Send success message to parent window
          window.opener.postMessage({ 
            type: 'GSC_OAUTH_SUCCESS', 
            code, 
            state 
          }, window.location.origin);
          
          console.log('Message sent, closing popup...');
          
          // Add a small delay to ensure message is sent
          setTimeout(() => {
            window.close();
          }, 100);
          return;
        } catch (e) {
          console.error('Error communicating with parent window:', e);
        }
      }

      console.log('Handling OAuth callback directly...');
      
      // If not a popup or communication failed, handle callback directly
      const response = await fetch(`${supabase.supabaseUrl}/functions/v1/gsc-oauth?action=callback&code=${code}&state=${state}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabase.supabaseKey}`,
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'OAuth callback failed');
      }

      const data = await response.json();
      
      if (data.success) {
        toast.success("Successfully connected to Google Search Console!");
        
        // Clear URL parameters - use correct path based on current location
        const currentPath = window.location.pathname;
        window.history.replaceState({}, document.title, currentPath);
        
        // The SEOManager component will automatically detect the connection
        // and update the UI through its checkGSCConnection function
      } else {
        throw new Error(data.error || 'OAuth callback failed');
      }
    } catch (error: any) {
      console.error('OAuth callback error:', error);
      toast.error(`Failed to complete OAuth: ${error.message}`);
      
      // Clear URL parameters even on error
      const currentPath = window.location.pathname;
      window.history.replaceState({}, document.title, currentPath);
    }
  };

  return <SEOManager />;
}
