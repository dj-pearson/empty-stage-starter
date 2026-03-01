import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { HelpCircle, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function SupportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    subject: "",
    description: "",
    category: "question" as "bug" | "feature_request" | "question" | "billing" | "other",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please sign in to submit a support ticket",
          variant: "destructive",
        });
        return;
      }

      // Gather context
      const context = {
        url: window.location.href,
        userAgent: navigator.userAgent,
        screenSize: `${window.screen.width}x${window.screen.height}`,
        timestamp: new Date().toISOString(),
      };

      // Create ticket
      // @ts-ignore - Table exists but types not yet regenerated
      const { error: ticketError } = await supabase.from("support_tickets").insert({
        user_id: user.id,
        subject: formData.subject,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        context,
      });

      if (ticketError) throw ticketError;

      toast({
        title: "Ticket submitted!",
        description: "We'll respond to your ticket within 24 hours",
      });

      // Reset form
      setFormData({
        subject: "",
        description: "",
        category: "question",
        priority: "medium",
      });
      setIsOpen(false);
    } catch (error: unknown) {
      toast({
        title: "Error submitting ticket",
        description: error instanceof Error ? error.message : "Failed to submit support ticket",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 hover:scale-110 transition-transform"
          title="Get Support"
        >
          <HelpCircle className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Get Support</SheetTitle>
          <SheetDescription>
            Submit a support ticket and we'll get back to you within 24 hours
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div>
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              placeholder="Brief description of your issue"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="category">Category *</Label>
            <Select
              value={formData.category}
              onValueChange={(value: typeof formData.category) =>
                setFormData({ ...formData, category: value })
              }
            >
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="question">Question</SelectItem>
                <SelectItem value="bug">Bug Report</SelectItem>
                <SelectItem value="feature_request">Feature Request</SelectItem>
                <SelectItem value="billing">Billing Issue</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="priority">Priority</Label>
            <Select
              value={formData.priority}
              onValueChange={(value: typeof formData.priority) =>
                setFormData({ ...formData, priority: value })
              }
            >
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low - Can wait</SelectItem>
                <SelectItem value="medium">Medium - Normal</SelectItem>
                <SelectItem value="high">High - Important</SelectItem>
                <SelectItem value="urgent">Urgent - Blocking me</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Please provide details about your issue..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Include steps to reproduce if reporting a bug
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>Submitting...</>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit Ticket
              </>
            )}
          </Button>

          <div className="text-xs text-muted-foreground text-center pt-2 border-t">
            <p>Need immediate help?</p>
            <p className="mt-1">
              Check our{" "}
              <a href="/faq" className="text-primary hover:underline">
                Help Center
              </a>{" "}
              for answers to common questions
            </p>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

