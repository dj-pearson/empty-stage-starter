import { useState, useEffect, useMemo, useRef } from "react";
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
import { Eye, EyeOff, CheckCircle, Sparkles, Calendar, ShoppingCart, TrendingUp, XCircle, AlertCircle, Mail, ArrowLeft } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { FaApple } from "react-icons/fa";
import { Link } from "react-router-dom";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { PasswordResetDialog } from "@/components/PasswordResetDialog";
import { PasswordSchema, EmailSchema, sanitizeURL } from "@/lib/validations";
import { Footer } from "@/components/Footer";
import { cn } from "@/lib/utils";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

// Password requirement checks for real-time validation feedback
interface PasswordRequirements {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

function checkPasswordRequirements(password: string): PasswordRequirements {
  return {
    minLength: password.length >= 12,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
}

// Requirement indicator component for password validation
function RequirementIndicator({ met, label }: { met: boolean; label: string }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 text-xs transition-colors",
      met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
    )}>
      {met ? (
        <CheckCircle className="h-3 w-3" />
      ) : (
        <div className="h-3 w-3 rounded-full border border-current" />
      )}
      <span>{label}</span>
    </div>
  );
}

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  // OTP verification state
  const [showOtpVerification, setShowOtpVerification] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Real-time email validation
  const emailValidation = useMemo(() => {
    if (!email || !emailTouched) return { isValid: null, error: null };
    const result = EmailSchema.safeParse(email);
    return {
      isValid: result.success,
      error: result.success ? null : result.error.errors[0].message,
    };
  }, [email, emailTouched]);

  // Real-time password requirements check
  const passwordRequirements = useMemo(() => checkPasswordRequirements(password), [password]);

  // Check if all password requirements are met
  const isPasswordValid = useMemo(() => {
    return Object.values(passwordRequirements).every(Boolean);
  }, [passwordRequirements]);

  // Get the redirect URL from query params (where user was trying to go)
  // Validate redirect URL to prevent open redirect attacks
  const rawRedirect = searchParams.get("redirect") || "/dashboard";
  const sanitizedRedirect = sanitizeURL(rawRedirect);
  // Only allow internal redirects (relative paths starting with /)
  // Fall back to dashboard if the URL is invalid or external
  const redirectTo = sanitizedRedirect.startsWith("/") ? sanitizedRedirect : "/dashboard";
  
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
            .then(({ data: profile, error }) => {
              // If no profile exists or onboarding is complete, go to dashboard
              if (error || profile?.onboarding_completed) {
                navigate(redirectTo, { replace: true });
              } else {
                // First time login with profile but incomplete onboarding
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
          .then(({ data: profile, error }) => {
            // If no profile exists or onboarding is complete, go to dashboard
            if (error || profile?.onboarding_completed) {
              navigate(redirectTo, { replace: true });
            } else {
              setShowOnboarding(true);
            }
          });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, redirectTo]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

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
      // Show OTP verification screen
      setPendingEmail(email);
      setShowOtpVerification(true);
      setResendCooldown(60);
      toast({
        title: "Check your email!",
        description: "We've sent a 6-digit verification code to your email.",
      });
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (otpCode.length !== 6) {
      toast({
        title: "Invalid Code",
        description: "Please enter the 6-digit code from your email.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token: otpCode,
      type: "signup",
    });

    setLoading(false);

    if (error) {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Email Verified!",
        description: "Your account has been confirmed. Welcome to EatPal!",
      });
      // The onAuthStateChange listener will handle the redirect
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;

    setLoading(true);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
    });

    setLoading(false);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setResendCooldown(60);
      toast({
        title: "Code Resent",
        description: "A new verification code has been sent to your email.",
      });
    }
  };

  const handleBackToSignup = () => {
    setShowOtpVerification(false);
    setOtpCode("");
    setPendingEmail("");
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

  const signInWithOAuth = async (provider: 'google' | 'apple') => {
    const callbackUrl = `${window.location.origin}/auth?redirect=${encodeURIComponent(redirectTo)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
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

      <div className="min-h-screen flex flex-col lg:flex-row">
        {/* Left side - Value Props (hidden on mobile) */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-primary/80 p-12 flex-col justify-center relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-white/5 rounded-full blur-3xl" />

          <div className="relative z-10 max-w-lg">
            <Link to="/" className="inline-block mb-8">
              <img
                src="/Logo-White.png"
                alt="EatPal"
                className="h-12"
              />
            </Link>

            <h1 className="text-4xl font-heading font-bold text-white mb-4">
              End Mealtime Battles Forever
            </h1>
            <p className="text-xl text-white/80 mb-10 leading-relaxed">
              Join 2,000+ parents who've transformed picky eaters into adventurous eaters—one safe food at a time.
            </p>

            <div className="space-y-6">
              {[
                {
                  icon: Sparkles,
                  title: "AI-Powered Meal Plans",
                  description: "Get personalized weekly plans using foods your child actually eats"
                },
                {
                  icon: Calendar,
                  title: "One Try-Bite Per Day",
                  description: "Science-backed food chaining to gently expand their palate"
                },
                {
                  icon: ShoppingCart,
                  title: "Auto Grocery Lists",
                  description: "Never forget an ingredient again with auto-generated shopping lists"
                },
                {
                  icon: TrendingUp,
                  title: "Track Real Progress",
                  description: "See data-driven insights on what's working"
                }
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{item.title}</h3>
                    <p className="text-sm text-white/70">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Social proof */}
            <div className="mt-12 pt-8 border-t border-white/20">
              <div className="flex items-center gap-4">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-xs text-white">
                      {["👩", "👨", "👩", "👨", "👩"][i-1]}
                    </div>
                  ))}
                </div>
                <div className="text-white/80 text-sm">
                  <span className="font-semibold text-white">2,000+</span> happy families
                </div>
              </div>
              <div className="mt-3 text-white/70 text-sm">
                ⭐⭐⭐⭐⭐ <span className="text-white font-semibold">4.8/5</span> average rating
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Auth Form */}
        <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-background to-muted p-4 lg:p-12">
          <div className="w-full max-w-md">
            {/* Mobile header */}
            <div className="lg:hidden text-center mb-8">
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
            </div>

            {/* Desktop back button */}
            <div className="hidden lg:block mb-6">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  ← Back to Home
                </Button>
              </Link>
            </div>

            <Card>
              {showOtpVerification ? (
                <>
                  <CardHeader>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit -ml-2 mb-2"
                      onClick={handleBackToSignup}
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back
                    </Button>
                    <div className="flex items-center justify-center mb-4">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <Mail className="h-8 w-8 text-primary" />
                      </div>
                    </div>
                    <CardTitle className="text-center">Check Your Email</CardTitle>
                    <CardDescription className="text-center">
                      We sent a 6-digit code to<br />
                      <span className="font-medium text-foreground">{pendingEmail}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleVerifyOtp} className="space-y-6">
                      <div className="flex justify-center">
                        <InputOTP
                          maxLength={6}
                          value={otpCode}
                          onChange={(value) => setOtpCode(value)}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      <LoadingButton
                        type="submit"
                        className="w-full h-11"
                        isLoading={loading}
                        disabled={otpCode.length !== 6}
                      >
                        Verify Email
                      </LoadingButton>

                      <div className="text-center text-sm text-muted-foreground">
                        Didn't receive the code?{" "}
                        {resendCooldown > 0 ? (
                          <span>Resend in {resendCooldown}s</span>
                        ) : (
                          <Button
                            type="button"
                            variant="link"
                            className="p-0 h-auto text-primary"
                            onClick={handleResendCode}
                            disabled={loading}
                          >
                            Resend code
                          </Button>
                        )}
                      </div>
                    </form>
                  </CardContent>
                </>
              ) : (
                <>
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
                      <div className="relative">
                        <Input
                          id="signup-email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onBlur={() => setEmailTouched(true)}
                          required
                          aria-invalid={emailValidation.isValid === false}
                          aria-describedby={emailValidation.error ? "email-error" : undefined}
                          className={cn(
                            "h-11 pr-10 transition-colors",
                            emailValidation.isValid === true && "border-green-500 focus-visible:ring-green-500",
                            emailValidation.isValid === false && "border-red-500 focus-visible:ring-red-500"
                          )}
                        />
                        {emailTouched && email && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            {emailValidation.isValid ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                          </div>
                        )}
                      </div>
                      {emailValidation.error && (
                        <p id="email-error" className="text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {emailValidation.error}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="signup-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setPasswordTouched(true);
                          }}
                          required
                          minLength={12}
                          aria-invalid={passwordTouched && !isPasswordValid}
                          aria-describedby="password-requirements"
                          className={cn(
                            "h-11 pr-10 transition-colors",
                            passwordTouched && isPasswordValid && "border-green-500 focus-visible:ring-green-500",
                            passwordTouched && password && !isPasswordValid && "border-amber-500 focus-visible:ring-amber-500"
                          )}
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
                      {/* Real-time password requirements */}
                      <div id="password-requirements" className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                        <RequirementIndicator met={passwordRequirements.minLength} label="12+ characters" />
                        <RequirementIndicator met={passwordRequirements.hasUppercase} label="Uppercase letter" />
                        <RequirementIndicator met={passwordRequirements.hasLowercase} label="Lowercase letter" />
                        <RequirementIndicator met={passwordRequirements.hasNumber} label="Number" />
                        <RequirementIndicator met={passwordRequirements.hasSpecial} label="Special character" />
                      </div>
                    </div>
                    <LoadingButton
                      type="submit"
                      className="w-full h-11"
                      isLoading={loading}
                      disabled={!isPasswordValid || emailValidation.isValid === false}
                    >
                      Sign Up
                    </LoadingButton>

                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          Or continue with
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => signInWithOAuth('google')}
                        className="w-full h-11"
                      >
                        <FcGoogle className="h-5 w-5 mr-2" />
                        Google
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => signInWithOAuth('apple')}
                        className="w-full h-11"
                      >
                        <FaApple className="h-5 w-5 mr-2" />
                        Apple
                      </Button>
                    </div>
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

                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          Or continue with
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => signInWithOAuth('google')}
                        className="w-full h-11"
                      >
                        <FcGoogle className="h-5 w-5 mr-2" />
                        Google
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => signInWithOAuth('apple')}
                        className="w-full h-11"
                      >
                        <FaApple className="h-5 w-5 mr-2" />
                        Apple
                      </Button>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>
              </CardContent>
                </>
              )}
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

            {/* Mobile value props */}
            <div className="lg:hidden mt-8 p-4 bg-muted/50 rounded-lg">
              <h3 className="font-semibold text-sm mb-3 text-center">Why parents love EatPal:</h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  "AI meal planning",
                  "Food chaining science",
                  "Auto grocery lists",
                  "Progress tracking"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-primary shrink-0" />
                    <span className="text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default Auth;
