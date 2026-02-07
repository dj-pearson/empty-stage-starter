/**
 * AuthCallback.tsx
 *
 * Dedicated callback handler for OAuth authentication (Google/Apple Sign-In).
 * This page receives the OAuth tokens from Supabase Auth and redirects to the app.
 *
 * Flow:
 * 1. User clicks "Sign in with Google/Apple" on /auth
 * 2. Supabase redirects to Google/Apple for authentication
 * 3. OAuth provider redirects to Supabase Auth callback (/auth/v1/callback)
 * 4. Supabase Auth redirects here (/auth/callback) with tokens in URL fragment
 * 5. This page extracts tokens, creates session, and redirects to dashboard
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { LoadingFallback } from '@/components/LoadingFallback';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { loginHistory, type LoginMethod } from '@/lib/login-history';
import { trackSignup } from '@/lib/conversion-tracking';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check for error in URL params (from OAuth provider)
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
          console.error('OAuth error:', error, errorDescription);
          setStatus('error');
          setErrorMessage(errorDescription || error || 'Authentication failed');
          return;
        }

        // Check for magic link token from our OAuth proxy edge function
        const token = searchParams.get('token');
        const type = searchParams.get('type');
        const redirectToParam = searchParams.get('redirect_to');
        const isNewUser = searchParams.get('new_user') === 'true';

        if (token && type) {
          console.log('Magic link token detected, verifying...');

          // Verify the magic link token
          const { data, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: type as any,
          });

          if (verifyError) {
            console.error('Token verification error:', verifyError);
            setStatus('error');
            setErrorMessage(verifyError.message);
            return;
          }

          if (data.session) {
            console.log('Session created successfully via magic link');

            // Track new signups
            if (isNewUser) {
              const provider = data.session.user.app_metadata?.provider;
              if (provider) {
                trackSignup(provider);
              }
            }

            await handleSuccessfulAuth(data.session, redirectToParam || undefined);
            return;
          }
        }

        // PKCE Flow: Check for authorization code in URL params
        // When using PKCE, Supabase returns a code that needs to be exchanged
        const code = searchParams.get('code');

        if (code) {
          console.log('PKCE code detected, exchanging for session...');

          // Exchange the code for a session
          // The Supabase client handles PKCE verification automatically
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error('PKCE exchange error:', exchangeError);
            setStatus('error');
            setErrorMessage(exchangeError.message);
            return;
          }

          if (data.session) {
            console.log('Session created successfully via PKCE');
            await handleSuccessfulAuth(data.session);
            return;
          }
        }

        // Legacy/Implicit Flow: Check for tokens in URL hash fragment
        // This handles the case where PKCE wasn't used
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const errorFromHash = hashParams.get('error');

        if (errorFromHash) {
          console.error('OAuth hash error:', errorFromHash);
          setStatus('error');
          setErrorMessage(hashParams.get('error_description') || errorFromHash);
          return;
        }

        // If we have tokens in the hash, set the session manually
        if (accessToken && refreshToken) {
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            console.error('Session error:', sessionError);
            setStatus('error');
            setErrorMessage(sessionError.message);
            return;
          }

          if (data.session) {
            await handleSuccessfulAuth(data.session);
            return;
          }
        }

        // If no code or tokens, try to get existing session
        // (Session might have been set by detectSessionInUrl)
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          await handleSuccessfulAuth(session);
          return;
        }

        // No session found - redirect to auth page
        console.log('No session found in callback, redirecting to auth');
        navigate('/auth', { replace: true });

      } catch (err) {
        console.error('Auth callback error:', err);
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
      }
    };

    // Helper function to handle successful authentication
    const handleSuccessfulAuth = async (session: any, overrideRedirect?: string) => {
      // Log the OAuth login
      const provider = session.user.app_metadata?.provider as LoginMethod;
      if (provider === 'google' || provider === 'apple') {
        loginHistory.logLogin(
          session.user.id,
          session.user.email || '',
          provider,
          { provider, isOAuth: true }
        );

        // Check if this is a new signup (user created in the last 5 minutes)
        const createdAt = new Date(session.user.created_at);
        const isNewUser = Date.now() - createdAt.getTime() < 5 * 60 * 1000;
        if (isNewUser) {
          trackSignup(provider);
        }
      }

      setStatus('success');

      // Get the stored redirect destination (or use override from URL param)
      const storedRedirect = overrideRedirect || sessionStorage.getItem('oauth_redirect');
      sessionStorage.removeItem('oauth_redirect');

      // Check if onboarding is complete
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', session.user.id)
        .single();

      // Small delay for visual feedback
      setTimeout(() => {
        if (profile && !profile.onboarding_completed) {
          // Redirect to auth page to show onboarding
          navigate('/auth', { replace: true });
        } else {
          // Redirect to stored destination or dashboard
          navigate(storedRedirect || '/dashboard', { replace: true });
        }
      }, 500);
    };

    handleCallback();
  }, [navigate, searchParams]);

  if (status === 'processing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <LoadingFallback message="Completing sign in..." />
          <p className="text-sm text-muted-foreground mt-4">
            Please wait while we verify your credentials
          </p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>Sign in successful!</CardTitle>
            <CardDescription>Redirecting you to your dashboard...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center mb-4">
            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle>Authentication Failed</CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full"
            onClick={() => navigate('/auth', { replace: true })}
          >
            Try Again
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate('/', { replace: true })}
          >
            Go to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
