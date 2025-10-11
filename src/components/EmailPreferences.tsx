import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Mail, History, Send } from "lucide-react";
import {
  getEmailSubscriptions,
  updateEmailSubscriptions,
  getEmailHistory,
  sendTestEmail,
  formatEmailStatus,
  formatTemplateName,
  type EmailSubscriptions,
  type EmailLog,
} from "@/lib/email";

export function EmailPreferences() {
  const [preferences, setPreferences] = useState<EmailSubscriptions | null>(null);
  const [history, setHistory] = useState<EmailLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const [prefsData, historyData] = await Promise.all([
      getEmailSubscriptions(),
      getEmailHistory(10),
    ]);
    setPreferences(prefsData);
    setHistory(historyData);
    setIsLoading(false);
  };

  const handleUpdatePreference = async (key: keyof EmailSubscriptions, value: boolean) => {
    if (!preferences) return;

    // Optimistically update UI
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);

    // Update in database
    const success = await updateEmailSubscriptions({ [key]: value });
    if (!success) {
      // Revert on failure
      setPreferences(preferences);
    }
  };

  const handleSendTest = async () => {
    setIsSendingTest(true);
    await sendTestEmail();
    setIsSendingTest(false);

    // Reload history to show new test email
    setTimeout(async () => {
      const historyData = await getEmailHistory(10);
      setHistory(historyData);
    }, 1000);
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">Loading email preferences...</div>
      </Card>
    );
  }

  if (!preferences) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          Failed to load email preferences
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Email Preferences */}
      <Card className="p-6">
        <div className="flex items-start gap-3 mb-6">
          <Mail className="w-5 h-5 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Email Preferences</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Choose which emails you'd like to receive from EatPal
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendTest}
            disabled={isSendingTest}
          >
            <Send className="w-4 h-4 mr-2" />
            {isSendingTest ? "Sending..." : "Send Test"}
          </Button>
        </div>

        <div className="space-y-6">
          {/* Welcome Emails */}
          <div className="flex items-start justify-between pb-4 border-b">
            <div className="flex-1">
              <Label htmlFor="welcome-emails" className="text-base font-medium">
                Welcome Emails
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Get started guide and tips when you first join
              </p>
            </div>
            <Switch
              id="welcome-emails"
              checked={preferences.welcome_emails}
              onCheckedChange={(checked) => handleUpdatePreference("welcome_emails", checked)}
            />
          </div>

          {/* Milestone Emails */}
          <div className="flex items-start justify-between pb-4 border-b">
            <div className="flex-1">
              <Label htmlFor="milestone-emails" className="text-base font-medium">
                Milestone Achievements
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Celebrate when your child reaches important milestones
              </p>
            </div>
            <Switch
              id="milestone-emails"
              checked={preferences.milestone_emails}
              onCheckedChange={(checked) => handleUpdatePreference("milestone_emails", checked)}
            />
          </div>

          {/* Weekly Summary */}
          <div className="flex items-start justify-between pb-4 border-b">
            <div className="flex-1">
              <Label htmlFor="weekly-summary" className="text-base font-medium">
                Weekly Summary
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Get a recap of your child's progress every week
              </p>
            </div>
            <Switch
              id="weekly-summary"
              checked={preferences.weekly_summary}
              onCheckedChange={(checked) => handleUpdatePreference("weekly_summary", checked)}
            />
          </div>

          {/* Tips and Advice */}
          <div className="flex items-start justify-between pb-4 border-b">
            <div className="flex-1">
              <Label htmlFor="tips-advice" className="text-base font-medium">
                Tips & Advice
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Helpful strategies and expert advice for picky eating
              </p>
            </div>
            <Switch
              id="tips-advice"
              checked={preferences.tips_and_advice}
              onCheckedChange={(checked) => handleUpdatePreference("tips_and_advice", checked)}
            />
          </div>

          {/* Marketing Emails */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <Label htmlFor="marketing-emails" className="text-base font-medium">
                Product Updates & News
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Stay informed about new features and platform updates
              </p>
            </div>
            <Switch
              id="marketing-emails"
              checked={preferences.marketing_emails}
              onCheckedChange={(checked) => handleUpdatePreference("marketing_emails", checked)}
            />
          </div>
        </div>
      </Card>

      {/* Email History */}
      <Card className="p-6">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowHistory(!showHistory)}
        >
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <History className="w-5 h-5" />
            Email History
          </h3>
          <Button variant="ghost" size="sm">
            {showHistory ? "Hide" : "Show"}
          </Button>
        </div>

        {showHistory && (
          <div className="mt-4 space-y-3">
            {history.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">No emails sent yet</div>
            ) : (
              history.map((email) => {
                const status = formatEmailStatus(email.status);
                return (
                  <div
                    key={email.id}
                    className="flex items-start justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`${status.color} font-medium`}>
                          {status.icon} {status.label}
                        </span>
                        <span className="text-sm text-muted-foreground">·</span>
                        <span className="text-sm text-muted-foreground">
                          {formatTemplateName(email.template_key)}
                        </span>
                      </div>

                      <div className="text-sm font-medium mb-1">{email.subject}</div>

                      <div className="text-sm text-muted-foreground">
                        {email.sent_at
                          ? `Sent ${new Date(email.sent_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                          : `Queued ${new Date(email.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`}
                      </div>

                      {email.error_message && (
                        <div className="text-sm text-red-600 mt-2">
                          Error: {email.error_message}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </Card>

      {/* Info Card */}
      <Card className="p-6 bg-muted/50">
        <h4 className="font-medium mb-2">About Emails</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• You can unsubscribe from any email type at any time</li>
          <li>• We'll never share your email address with third parties</li>
          <li>• Transactional emails (like password resets) cannot be disabled</li>
          <li>• You can click "Unsubscribe" in any email footer to opt out of all emails</li>
        </ul>
      </Card>
    </div>
  );
}
