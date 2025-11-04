import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const OAuthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    console.log('OAuth Callback Handler - processing:', { code: !!code, state: !!state, error });

    if (error) {
      console.error('OAuth error:', error);
      // Store error and redirect to admin
      sessionStorage.setItem('gsc_oauth_error', error);
      navigate('/admin?tab=seo', { replace: true });
      return;
    }

    if (code && state) {
      console.log('Storing OAuth data and redirecting to admin');
      // Store OAuth data for processing in admin after authentication
      sessionStorage.setItem('gsc_oauth_code', code);
      sessionStorage.setItem('gsc_oauth_state', state);
      sessionStorage.setItem('gsc_oauth_pending', 'true');
      
      // Redirect to admin which will handle authentication and then process OAuth
      navigate('/admin?tab=seo', { replace: true });
      return;
    }

    // No OAuth parameters, just redirect to admin
    navigate('/admin', { replace: true });
  }, [location, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center p-8 max-w-md">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold mb-2">Processing Authorization...</h2>
        <p className="text-muted-foreground">
          Please wait while we complete your Google Search Console connection.
        </p>
      </div>
    </div>
  );
};

export default OAuthCallback;