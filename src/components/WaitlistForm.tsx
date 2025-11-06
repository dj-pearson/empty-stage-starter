import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, CheckCircle } from "lucide-react";

export const WaitlistForm = () => {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.functions.invoke('join-waitlist', {
        body: {
          email,
          fullName,
          referralSource: 'landing_page',
          utmCampaign: new URLSearchParams(window.location.search).get('utm_campaign'),
          utmSource: new URLSearchParams(window.location.search).get('utm_source'),
          utmMedium: new URLSearchParams(window.location.search).get('utm_medium'),
        },
      });

      if (error) throw error;

      setSuccess(true);
      toast({
        title: "You're on the list! 🎉",
        description: "Check your email for a confirmation message.",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error.message || "Failed to join waitlist. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="border-2 border-primary/20 bg-primary/5">
        <CardContent className="pt-10 text-center">
          <CheckCircle className="h-16 w-16 text-primary mx-auto mb-4" />
          <h3 className="text-2xl font-heading font-bold text-primary mb-2">
            You're In! 🎉
          </h3>
          <p className="text-muted-foreground mb-4">
            Welcome to the EatPal waitlist! Check your email for confirmation.
          </p>
          <p className="text-sm text-muted-foreground">
            We'll notify you as soon as we launch on November 1st, 2025.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="bg-primary/10 p-3 rounded-full">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
        </div>
        <CardTitle className="text-3xl font-heading font-bold text-primary">
          Be the First to Try EatPal
        </CardTitle>
        <CardDescription className="text-base">
          Join our exclusive waitlist and get early access when we launch on November 1st, 2025
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="waitlist-name">Full Name</Label>
            <Input
              id="waitlist-name"
              type="text"
              placeholder="John Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="h-12"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="waitlist-email">Email Address</Label>
            <Input
              id="waitlist-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full h-12 text-lg font-semibold"
            disabled={loading}
          >
            {loading ? "Joining..." : "Join the Waitlist"}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            By joining, you'll receive updates about our launch and exclusive early-bird pricing
          </p>
        </form>
      </CardContent>
    </Card>
  );
};