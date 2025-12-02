import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Calendar as CalendarIcon,
  Clock,
  Edit,
  X,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { format, addDays, setHours, setMinutes, isBefore, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
}

interface ScheduledPublishLog {
  id: string;
  post_id: string;
  scheduled_for: string;
  published_at: string | null;
  status: string;
  error_message: string | null;
}

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: BlogPost | null;
  onSchedule: (postId: string, scheduledFor: Date) => Promise<void>;
}

function ScheduleDialog({ open, onOpenChange, post, onSchedule }: ScheduleDialogProps) {
  const [date, setDate] = useState<Date | undefined>(
    post?.scheduled_for ? new Date(post.scheduled_for) : undefined
  );
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    if (post?.scheduled_for) {
      const schedDate = new Date(post.scheduled_for);
      setDate(schedDate);
      setHour(schedDate.getHours().toString().padStart(2, '0'));
      setMinute(schedDate.getMinutes().toString().padStart(2, '0'));
    } else {
      // Default to tomorrow at 9 AM
      const tomorrow = addDays(new Date(), 1);
      setDate(tomorrow);
      setHour('09');
      setMinute('00');
    }
  }, [post]);

  const handleSchedule = async () => {
    if (!date || !post) return;

    const scheduledDate = setMinutes(setHours(date, parseInt(hour)), parseInt(minute));

    if (isBefore(scheduledDate, new Date())) {
      toast.error('Cannot schedule in the past');
      return;
    }

    setScheduling(true);
    try {
      await onSchedule(post.id, scheduledDate);
      onOpenChange(false);
    } finally {
      setScheduling(false);
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = ['00', '15', '30', '45'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Schedule Publication
          </DialogTitle>
          <DialogDescription>
            Choose when this post should be automatically published
          </DialogDescription>
        </DialogHeader>

        {post && (
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium text-sm">{post.title}</p>
              <p className="text-xs text-muted-foreground mt-1">/{post.slug}</p>
            </div>

            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(date) => isBefore(date, startOfDay(new Date()))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hour</Label>
                <Select value={hour} onValueChange={setHour}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {hours.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Minute</Label>
                <Select value={minute} onValueChange={setMinute}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {minutes.map((m) => (
                      <SelectItem key={m} value={m}>
                        :{m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {date && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900">
                  Post will be published on{' '}
                  <strong>
                    {format(
                      setMinutes(setHours(date, parseInt(hour)), parseInt(minute)),
                      "MMMM d, yyyy 'at' h:mm a"
                    )}
                  </strong>
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={!date || scheduling}>
            {scheduling ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Scheduling...
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 mr-2" />
                Schedule
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduledPublishing() {
  const [scheduledPosts, setScheduledPosts] = useState<BlogPost[]>([]);
  const [draftPosts, setDraftPosts] = useState<BlogPost[]>([]);
  const [publishLog, setPublishLog] = useState<ScheduledPublishLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load scheduled posts
      const { data: scheduled, error: scheduledError } = await supabase
        .from('blog_posts')
        .select('id, title, slug, status, scheduled_for, published_at, created_at')
        .eq('status', 'scheduled')
        .order('scheduled_for', { ascending: true });

      if (scheduledError) throw scheduledError;
      setScheduledPosts(scheduled || []);

      // Load draft posts that can be scheduled
      const { data: drafts, error: draftsError } = await supabase
        .from('blog_posts')
        .select('id, title, slug, status, scheduled_for, published_at, created_at')
        .eq('status', 'draft')
        .order('created_at', { ascending: false });

      if (draftsError) throw draftsError;
      setDraftPosts(drafts || []);

      // Load recent publish log
      const { data: logs, error: logsError } = await supabase
        .from('scheduled_publish_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (logsError) {
        logger.warn('Could not load publish log:', logsError);
      } else {
        setPublishLog(logs || []);
      }
    } catch (error) {
      logger.error('Error loading scheduled posts:', error);
      toast.error('Failed to load scheduled posts');
    } finally {
      setLoading(false);
    }
  };

  const handleSchedule = async (postId: string, scheduledFor: Date) => {
    try {
      const { error } = await supabase
        .from('blog_posts')
        .update({
          status: 'scheduled',
          scheduled_for: scheduledFor.toISOString(),
        })
        .eq('id', postId);

      if (error) throw error;

      toast.success('Post scheduled successfully');
      loadData();
    } catch (error) {
      logger.error('Error scheduling post:', error);
      toast.error('Failed to schedule post');
      throw error;
    }
  };

  const handleCancelSchedule = async (postId: string) => {
    try {
      const { error } = await supabase
        .from('blog_posts')
        .update({
          status: 'draft',
          scheduled_for: null,
        })
        .eq('id', postId);

      if (error) throw error;

      toast.success('Schedule cancelled');
      loadData();
    } catch (error) {
      logger.error('Error cancelling schedule:', error);
      toast.error('Failed to cancel schedule');
    }
  };

  const handlePublishNow = async (postId: string) => {
    try {
      const { error } = await supabase
        .from('blog_posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          scheduled_for: null,
        })
        .eq('id', postId);

      if (error) throw error;

      toast.success('Post published');
      loadData();
    } catch (error) {
      logger.error('Error publishing post:', error);
      toast.error('Failed to publish post');
    }
  };

  const openScheduleDialog = (post: BlogPost) => {
    setSelectedPost(post);
    setShowScheduleDialog(true);
  };

  return (
    <div className="space-y-6">
      {/* Scheduled Posts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Scheduled Posts
          </CardTitle>
          <CardDescription>Posts queued for automatic publication</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : scheduledPosts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No scheduled posts</p>
              <p className="text-sm mt-1">Schedule a draft post below</p>
            </div>
          ) : (
            <div className="space-y-3">
              {scheduledPosts.map((post) => (
                <Card key={post.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium">{post.title}</h4>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <CalendarIcon className="h-4 w-4" />
                        <span>
                          {post.scheduled_for
                            ? format(new Date(post.scheduled_for), "MMM d, yyyy 'at' h:mm a")
                            : 'Not scheduled'}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openScheduleDialog(post)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePublishNow(post.id)}
                      >
                        <ChevronRight className="h-4 w-4 mr-1" />
                        Publish Now
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCancelSchedule(post.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Draft Posts Ready to Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Draft Posts
          </CardTitle>
          <CardDescription>Posts ready to be scheduled or published</CardDescription>
        </CardHeader>
        <CardContent>
          {draftPosts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No draft posts available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {draftPosts.map((post) => (
                <Card key={post.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium">{post.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        Created {format(new Date(post.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openScheduleDialog(post)}
                      >
                        <Clock className="h-4 w-4 mr-1" />
                        Schedule
                      </Button>
                      <Button size="sm" onClick={() => handlePublishNow(post.id)}>
                        Publish Now
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Publish Log */}
      {publishLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {publishLog.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-2 text-sm py-2 border-b last:border-0"
                >
                  {log.status === 'published' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : log.status === 'failed' ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="flex-1">
                    {log.status === 'published'
                      ? 'Published on schedule'
                      : log.status === 'failed'
                      ? `Failed: ${log.error_message || 'Unknown error'}`
                      : 'Pending'}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {log.published_at
                      ? format(new Date(log.published_at), 'MMM d, h:mm a')
                      : format(new Date(log.scheduled_for), 'MMM d, h:mm a')}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schedule Dialog */}
      <ScheduleDialog
        open={showScheduleDialog}
        onOpenChange={setShowScheduleDialog}
        post={selectedPost}
        onSchedule={handleSchedule}
      />
    </div>
  );
}

export default ScheduledPublishing;
