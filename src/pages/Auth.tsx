import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Utensils, Eye, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { PasswordResetDialog } from "@/components/PasswordResetDialog";
import { PasswordSchema, EmailSchema } from "@/lib/validations";
import { Footer } from "@/components/Footer";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Get the redirect URL from query params (where user was trying to go)
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  
  // Get the default tab from query params (signin or signup)
  const defaultTab = searchParams.get("tab") || "signup";

  useEffect(() => {
    // Set up listener first
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        // Defer profile check to avoid deadlock
        setTimeout(() => {
          supabase
            .from("profiles")
            .select("onboarding_completed")
            .eq("id", session.user.id)
            .single()
            .then(({ data: profile }) => {
              if (profile?.onboarding_completed) {
                // Restore user's previous location
                navigate(redirectTo, { replace: true });
              } else {
                // First time login or incomplete onboarding - show setup
                setShowOnboarding(true);
              }
            });
        }, 0);
      }
    });

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", session.user.id)
          .single()
          .then(({ data: profile }) => {
            if (profile?.onboarding_completed) {
              // Restore user's previous location
              navigate(redirectTo, { replace: true });
            } else {
              setShowOnboarding(true);
            }
          });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, redirectTo]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate email format
    const emailValidation = EmailSchema.safeParse(email);
    if (!emailValidation.success) {
      toast({
        title: "Invalid Email",
        description: emailValidation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    // Validate password strength
    const passwordValidation = PasswordSchema.safeParse(password);
    if (!passwordValidation.success) {
      toast({
        title: "Weak Password",
        description: passwordValidation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    setLoading(false);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Check your email!",
        description: "Please confirm your email address to complete registration. Then sign in to set up your profile.",
      });
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);

    // Mark onboarding as complete
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);
    }

    // Navigate to intended destination (or dashboard if none)
    navigate(redirectTo, { replace: true });
  };

  return (
    <>
      <OnboardingDialog
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
        onOpenChange={setShowOnboarding}
      />

      <PasswordResetDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
      />

      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2 mb-4">
              <img
                src="/Logo-Green.png"
                alt="EatPal"
                className="h-10 block dark:hidden"
              />
              <img
                src="/Logo-White.png"
                alt="EatPal"
                className="h-10 hidden dark:block"
              />
            </Link>
            <p className="text-muted-foreground mb-3">
              Start your journey to easier meal planning
            </p>
            <Link to="/">
              <Button variant="ghost" size="sm">
                Back to Home
              </Button>
            </Link>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Welcome</CardTitle>
              <CardDescription>
                Sign in to your account or create a new one
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-lg text-center">
                <p className="text-sm font-semibold text-primary mb-1">
                  🎉 Now Live! Start Your Free Trial
                </p>
                <p className="text-xs text-muted-foreground">
                  Join families making mealtime easier
                </p>
              </div>
              <Tabs defaultValue={defaultTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                </TabsList>

                <TabsContent value="signup">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="signup-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={12}
                          className="h-11 pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-11 w-11 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="sr-only">
                            {showPassword ? "Hide password" : "Show password"}
                          </span>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Must be 12+ characters with uppercase, lowercase, number, and special character
                      </p>
                    </div>
                    <LoadingButton
                      type="submit"
                      className="w-full h-11"
                      isLoading={loading}
                    >
                      Sign Up
                    </LoadingButton>
                  </form>
                </TabsContent>

                <TabsContent value="signin">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signin-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="signin-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="h-11 pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-11 w-11 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="sr-only">
                            {showPassword ? "Hide password" : "Show password"}
                          </span>
                        </Button>
                      </div>
                      <div className="text-right">
                        <Button
                          type="button"
                          variant="link"
                          className="text-sm px-0 h-auto"
                          onClick={() => setShowResetDialog(true)}
                        >
                          Forgot Password?
                        </Button>
                      </div>
                    </div>
                    <LoadingButton
                      type="submit"
                      className="w-full h-11"
                      isLoading={loading}
                    >
                      Sign In
                    </LoadingButton>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-4">
            By continuing, you agree to our{" "}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default Auth;
