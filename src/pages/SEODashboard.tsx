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
            // First try same-origin
            window.opener.postMessage({ 
              type: 'GSC_OAUTH_SUCCESS', 
              code, 
              state 
            }, window.location.origin);
            
            // Then try wildcard as fallback
            setTimeout(() => {
              window.opener.postMessage({ 
                type: 'GSC_OAUTH_SUCCESS', 
                code, 
                state 
              }, '*');
              
              // Force close after message attempts
              setTimeout(() => {
                try {
                  window.close();
                } catch (e) {
                  console.log('Window close blocked, but message sent');
                }
              }, 100);
            }, 50);
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

  // Check if this is an OAuth callback popup
  const urlParams = new URLSearchParams(location.search);
  const isOAuthCallback = urlParams.has('code') && urlParams.has('state');
  const isPopup = window.opener && window.opener !== window;

  if (isOAuthCallback && isPopup) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center p-8 max-w-md">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold mb-2">Completing Authorization...</h2>
          <p className="text-muted-foreground mb-4">
            Please wait while we complete your Google Search Console connection.
          </p>
          <button 
            onClick={() => window.close()} 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Close Window
          </button>
        </div>
      </div>
    );
  }

  return <SEOManager />;
}
