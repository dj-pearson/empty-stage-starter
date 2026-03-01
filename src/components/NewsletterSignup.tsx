import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface NewsletterSignupProps {
  className?: string;
}

export function NewsletterSignup({ className }: NewsletterSignupProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsSubmitting(true);
    try {
      await supabase.from("newsletter_subscribers").insert({ email });
      setIsSubscribed(true);
      toast.success("You're subscribed! Check your inbox for a welcome email.");
      setEmail("");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubscribed) {
    return (
      <div className={`bg-primary/5 border border-primary/20 rounded-xl p-6 text-center ${className || ""}`}>
        <Mail className="h-8 w-8 text-primary mx-auto mb-2" />
        <p className="font-semibold text-foreground">You're subscribed!</p>
        <p className="text-sm text-muted-foreground">Check your inbox for weekly picky eating tips.</p>
      </div>
    );
  }

  return (
    <div className={`bg-card border rounded-xl p-6 ${className || ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <Mail className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Get weekly picky eating tips</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Delivered to your inbox every week. No spam, unsubscribe anytime.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1"
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "..." : "Subscribe"}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground mt-2">
        We respect your privacy. Unsubscribe at any time.
      </p>
    </div>
  );
}
