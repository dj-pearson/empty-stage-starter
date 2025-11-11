import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  BellOff,
  Clock,
  ShoppingCart,
  ChefHat,
  Sparkles,
  Users,
  TrendingUp,
  Moon,
  Save,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface NotificationPreferences {
  id?: string;
  user_id?: string;
  push_enabled: boolean;
  email_enabled: boolean;

  meal_reminders: boolean;
  grocery_reminders: boolean;
  prep_reminders: boolean;
  milestone_celebrations: boolean;
  partner_updates: boolean;
  weekly_summary: boolean;
  food_success_updates: boolean;
  template_suggestions: boolean;

  meal_reminder_time_minutes: number;
  grocery_reminder_day: string;
  grocery_reminder_time: string;
  prep_reminder_time: string;
  weekly_summary_day: string;
  weekly_summary_time: string;

  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;

  max_notifications_per_day: number;
  digest_mode: boolean;
}

interface NotificationPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationPreferencesDialog({
  open,
  onOpenChange,
}: NotificationPreferencesDialogProps) {
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    push_enabled: true,
    email_enabled: true,
    meal_reminders: true,
    grocery_reminders: true,
    prep_reminders: true,
    milestone_celebrations: true,
    partner_updates: true,
    weekly_summary: true,
    food_success_updates: true,
    template_suggestions: true,
    meal_reminder_time_minutes: 60,
    grocery_reminder_day: 'saturday',
    grocery_reminder_time: '09:00:00',
    prep_reminder_time: '18:00:00',
    weekly_summary_day: 'sunday',
    weekly_summary_time: '19:00:00',
    quiet_hours_enabled: true,
    quiet_hours_start: '21:00:00',
    quiet_hours_end: '07:00:00',
    max_notifications_per_day: 10,
    digest_mode: false,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadPreferences();
    }
  }, [open]);

  const loadPreferences = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // @ts-ignore - notification_preferences table exists but not in generated types yet
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') { // Not "no rows returned"
        throw error;
      }

      if (data) {
        setPrefs(data);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      toast.error('Failed to load notification preferences');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('household_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) {
        toast.error('Profile not found');
        return;
      }

      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          ...prefs,
          user_id: user.id,
          household_id: profile.household_id,
        });

      if (error) throw error;

      toast.success('Notification preferences saved!');
      onOpenChange(false);

    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <DialogTitle>Notification Preferences</DialogTitle>
          </div>
          <DialogDescription>
            Configure when and how you receive notifications
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-6">
              {/* Master Toggles */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm">Channels</h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <Label>Push Notifications</Label>
                  </div>
                  <Switch
                    checked={prefs.push_enabled}
                    onCheckedChange={(checked) => setPrefs({ ...prefs, push_enabled: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <Label>Email Notifications</Label>
                  </div>
                  <Switch
                    checked={prefs.email_enabled}
                    onCheckedChange={(checked) => setPrefs({ ...prefs, email_enabled: checked })}
                  />
                </div>
              </div>

              <Separator />

              {/* Notification Types */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm">Notification Types</h3>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ChefHat className="h-4 w-4 text-orange-500" />
                    <div>
                      <Label>Meal Reminders</Label>
                      <p className="text-xs text-muted-foreground">
                        Remind me before mealtime
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={prefs.meal_reminders}
                    onCheckedChange={(checked) => setPrefs({ ...prefs, meal_reminders: checked })}
                    disabled={!prefs.push_enabled && !prefs.email_enabled}
                  />
                </div>

                {prefs.meal_reminders && (
                  <div className="ml-6 pl-4 border-l-2 border-muted">
                    <Label className="text-xs">Remind me</Label>
                    <Select
                      value={prefs.meal_reminder_time_minutes.toString()}
                      onValueChange={(value) => setPrefs({ ...prefs, meal_reminder_time_minutes: parseInt(value) })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes before</SelectItem>
                        <SelectItem value="30">30 minutes before</SelectItem>
                        <SelectItem value="60">1 hour before</SelectItem>
                        <SelectItem value="120">2 hours before</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-green-500" />
                    <div>
                      <Label>Grocery Reminders</Label>
                      <p className="text-xs text-muted-foreground">
                        Weekly shopping reminder
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={prefs.grocery_reminders}
                    onCheckedChange={(checked) => setPrefs({ ...prefs, grocery_reminders: checked })}
                    disabled={!prefs.push_enabled && !prefs.email_enabled}
                  />
                </div>

                {prefs.grocery_reminders && (
                  <div className="ml-6 pl-4 border-l-2 border-muted space-y-2">
                    <div>
                      <Label className="text-xs">Day</Label>
                      <Select
                        value={prefs.grocery_reminder_day}
                        onValueChange={(value) => setPrefs({ ...prefs, grocery_reminder_day: value })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monday">Monday</SelectItem>
                          <SelectItem value="tuesday">Tuesday</SelectItem>
                          <SelectItem value="wednesday">Wednesday</SelectItem>
                          <SelectItem value="thursday">Thursday</SelectItem>
                          <SelectItem value="friday">Friday</SelectItem>
                          <SelectItem value="saturday">Saturday</SelectItem>
                          <SelectItem value="sunday">Sunday</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <div>
                      <Label>Prep Reminders</Label>
                      <p className="text-xs text-muted-foreground">
                        Thaw, marinate, etc.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={prefs.prep_reminders}
                    onCheckedChange={(checked) => setPrefs({ ...prefs, prep_reminders: checked })}
                    disabled={!prefs.push_enabled && !prefs.email_enabled}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <div>
                      <Label>Milestone Celebrations</Label>
                      <p className="text-xs text-muted-foreground">
                        New food achievements
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={prefs.milestone_celebrations}
                    onCheckedChange={(checked) => setPrefs({ ...prefs, milestone_celebrations: checked })}
                    disabled={!prefs.push_enabled && !prefs.email_enabled}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-500" />
                    <div>
                      <Label>Partner Updates</Label>
                      <p className="text-xs text-muted-foreground">
                        Activity from co-parents
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={prefs.partner_updates}
                    onCheckedChange={(checked) => setPrefs({ ...prefs, partner_updates: checked })}
                    disabled={!prefs.push_enabled && !prefs.email_enabled}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-teal-500" />
                    <div>
                      <Label>Weekly Summary</Label>
                      <p className="text-xs text-muted-foreground">
                        Progress and wins
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={prefs.weekly_summary}
                    onCheckedChange={(checked) => setPrefs({ ...prefs, weekly_summary: checked })}
                    disabled={!prefs.push_enabled && !prefs.email_enabled}
                  />
                </div>
              </div>

              <Separator />

              {/* Quiet Hours */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <h3 className="font-semibold text-sm">Quiet Hours</h3>
                      <p className="text-xs text-muted-foreground">
                        Don't disturb during these hours
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={prefs.quiet_hours_enabled}
                    onCheckedChange={(checked) => setPrefs({ ...prefs, quiet_hours_enabled: checked })}
                  />
                </div>

                {prefs.quiet_hours_enabled && (
                  <div className="ml-6 pl-4 border-l-2 border-muted grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">From</Label>
                      <Select
                        value={prefs.quiet_hours_start}
                        onValueChange={(value) => setPrefs({ ...prefs, quiet_hours_start: value })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={`${i.toString().padStart(2, '0')}:00:00`}>
                              {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">To</Label>
                      <Select
                        value={prefs.quiet_hours_end}
                        onValueChange={(value) => setPrefs({ ...prefs, quiet_hours_end: value })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={`${i.toString().padStart(2, '0')}:00:00`}>
                              {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Advanced */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm">Advanced</h3>

                <div>
                  <Label className="text-xs">Maximum notifications per day</Label>
                  <Select
                    value={prefs.max_notifications_per_day.toString()}
                    onValueChange={(value) => setPrefs({ ...prefs, max_notifications_per_day: parseInt(value) })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 per day</SelectItem>
                      <SelectItem value="10">10 per day</SelectItem>
                      <SelectItem value="20">20 per day</SelectItem>
                      <SelectItem value="50">No limit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Digest Mode</Label>
                    <p className="text-xs text-muted-foreground">
                      Bundle notifications together
                    </p>
                  </div>
                  <Switch
                    checked={prefs.digest_mode}
                    onCheckedChange={(checked) => setPrefs({ ...prefs, digest_mode: checked })}
                  />
                </div>
              </div>
            </div>
          </ScrollArea>
        )}

        <div className="flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Preferences
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
