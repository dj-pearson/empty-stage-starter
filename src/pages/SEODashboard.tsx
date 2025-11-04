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
      // Clear any OAuth state and redirect back to admin
      sessionStorage.removeItem('gsc_connecting');
      window.location.href = '/admin?tab=seo';
      return;
    }

    if (code && state) {
      console.log('SEO Dashboard - OAuth callback detected');
      
      // Handle OAuth callback directly (no popup logic needed)
      handleOAuthCallback(code, state);
    }
  }, [location]);

  const handleOAuthCallback = async (code: string, state: string) => {
    console.log('OAuth callback detected:', { code: code?.substring(0, 10) + '...', state: state?.substring(0, 10) + '...' });
    
    try {
      console.log('Processing OAuth callback...');
      
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
        // Set success state for redirect
        sessionStorage.setItem('gsc_oauth_success', 'true');
        
        // Redirect back to admin with SEO tab
        window.location.href = '/admin?tab=seo';
      } else {
        throw new Error(data.error || 'OAuth callback failed');
      }
    } catch (error: any) {
      console.error('OAuth callback error:', error);
      toast.error(`Failed to complete OAuth: ${error.message}`);
      
      // Clear OAuth state and redirect back
      sessionStorage.removeItem('gsc_connecting');
      setTimeout(() => {
        window.location.href = '/admin?tab=seo';
      }, 2000);
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
