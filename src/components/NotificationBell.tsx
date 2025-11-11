// @ts-nocheck
import { useState, useEffect } from "react";
import { Bell, Settings, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { NotificationPreferencesDialog } from "@/components/NotificationPreferencesDialog";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  sent_at: string;
  was_clicked: boolean;
  was_dismissed: boolean;
  data?: any;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPreferences, setShowPreferences] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadNotifications();

    // Set up real-time subscription
    const channel = supabase
      .channel('notification-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_history',
        },
        (payload) => {
          console.log('New notification:', payload);
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get recent notifications (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // @ts-ignore - notification_history table exists but not in generated types yet
      const { data, error } = await supabase
        .from('notification_history')
        .select('*')
        .eq('user_id', user.id)
        .gte('sent_at', sevenDaysAgo.toISOString())
        .order('sent_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      setNotifications(data || []);

      // Count unread (not clicked and not dismissed)
      const unread = (data || []).filter(
        (n) => !n.was_clicked && !n.was_dismissed
      ).length;
      setUnreadCount(unread);

    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      // @ts-ignore - notification_history columns exist but not in generated types yet
      const { error } = await supabase
        .from('notification_history')
        .update({
          was_clicked: true,
          clicked_at: new Date().toISOString(),
        })
        .eq('id', notificationId);

      if (error) throw error;

      // Update local state
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, was_clicked: true } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const dismissNotification = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notification_history')
        .update({
          was_dismissed: true,
          dismissed_at: new Date().toISOString(),
        })
        .eq('id', notificationId);

      if (error) throw error;

      // Update local state
      setNotifications((prev) =>
        prev.filter((n) => n.id !== notificationId)
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

    } catch (error) {
      console.error('Error dismissing notification:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // @ts-ignore - notification_history columns exist but not in generated types yet
      const { error } = await supabase
        .from('notification_history')
        .update({
          was_clicked: true,
          clicked_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('was_clicked', false);

      if (error) throw error;

      loadNotifications();

    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    // Return emoji based on notification type
    switch (type) {
      case 'meal_reminder':
        return '🍽️';
      case 'grocery_reminder':
        return '🛒';
      case 'prep_reminder':
        return '⏰';
      case 'milestone_celebration':
        return '🎉';
      case 'partner_update':
        return '👥';
      case 'weekly_summary':
        return '📊';
      case 'food_success':
        return '✨';
      case 'template_suggestion':
        return '📋';
      default:
        return '🔔';
    }
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[380px] p-0" align="end">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="h-7 text-xs"
                >
                  <Check className="h-3 w-3 mr-1" />
                  Mark all read
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsOpen(false);
                  setShowPreferences(true);
                }}
                className="h-7 w-7"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Notifications List */}
          <ScrollArea className="h-[400px]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No notifications yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  We'll notify you about meals, milestones, and more
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-accent transition-colors cursor-pointer ${
                      !notification.was_clicked && !notification.was_dismissed
                        ? 'bg-primary/5'
                        : ''
                    }`}
                    onClick={() => {
                      if (!notification.was_clicked) {
                        markAsRead(notification.id);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="text-2xl flex-shrink-0">
                        {getNotificationIcon(notification.notification_type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm">{notification.title}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissNotification(notification.id);
                            }}
                            className="h-6 w-6 flex-shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {notification.body}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notification.sent_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          {notifications.length > 0 && (
            <>
              <Separator />
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setIsOpen(false)}
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* Preferences Dialog */}
      <NotificationPreferencesDialog
        open={showPreferences}
        onOpenChange={setShowPreferences}
      />
    </>
  );
}
