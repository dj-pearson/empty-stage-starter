import { Helmet } from "react-helmet-async";
import { SEOManager } from "@/components/admin/SEOManager";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function SEODashboard() {
  const location = useLocation();

  // No longer handling OAuth callbacks in SEODashboard
  // All OAuth callbacks are now handled directly in Admin.tsx



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

  return (
    <div id="main-content">
      <Helmet>
        <title>SEO Dashboard - EatPal</title>
        <meta name="description" content="Manage SEO settings, structured data, and search engine optimization for EatPal" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <SEOManager />
    </div>
  );
}
