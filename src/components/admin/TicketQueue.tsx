// @ts-nocheck - Admin tables not yet in generated types
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Ticket,
  Clock,
  User,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Send,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface SupportTicket {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  subject: string;
  description: string;
  status: "new" | "in_progress" | "waiting_user" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  category: "bug" | "feature_request" | "question" | "billing" | "other";
  assigned_to: string | null;
  assigned_to_name: string | null;
  context: Record<string, any>;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  message_count: number;
  last_message_at: string | null;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  author_id: string | null;
  message: string;
  is_internal: boolean;
  created_at: string;
  author_email?: string;
  author_name?: string;
}

const priorityColors = {
  low: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  urgent: "bg-red-500/10 text-red-500 border-red-500/20 animate-pulse",
};

const statusColors = {
  new: "bg-blue-500/10 text-blue-500",
  in_progress: "bg-purple-500/10 text-purple-500",
  waiting_user: "bg-yellow-500/10 text-yellow-500",
  resolved: "bg-green-500/10 text-green-500",
  closed: "bg-gray-500/10 text-gray-500",
};

export function TicketQueue() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    fetchTickets();

    // Subscribe to new tickets
    logger.debug('Subscribing to ticket_changes');
    const channel = supabase
      .channel("ticket_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_tickets",
        },
        () => {
          fetchTickets();
        }
      )
      .subscribe();

    return () => {
      logger.debug('Unsubscribing from ticket_changes');
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      fetchMessages(selectedTicket.id);
    }
  }, [selectedTicket]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("ticket_queue")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error: unknown) {
      toast({
        title: "Error loading tickets",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (ticketId: string) => {
    try {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select(`
          *,
          author:author_id (
            email,
            profiles:id (full_name)
          )
        `)
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Flatten the author data
      const flattenedMessages = (data || []).map((msg) => ({
        ...msg,
        author_email: msg.author?.email,
        author_name: msg.author?.profiles?.full_name,
      }));

      setMessages(flattenedMessages);
    } catch (error: unknown) {
      toast({
        title: "Error loading messages",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    try {
      const updateData: Record<string, unknown> = { status: newStatus };

      if (newStatus === "resolved") {
        const { data: { user } } = await supabase.auth.getUser();
        updateData.resolved_at = new Date().toISOString();
        updateData.resolved_by = user?.id;
      }

      const { error } = await supabase
        .from("support_tickets")
        .update(updateData)
        .eq("id", ticketId);

      if (error) throw error;

      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus as any } : t))
      );

      toast({
        title: "Ticket updated",
        description: `Status changed to ${newStatus}`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error updating ticket",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSendMessage = async () => {
    if (!selectedTicket || !newMessage.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from("ticket_messages").insert({
        ticket_id: selectedTicket.id,
        author_id: user?.id,
        message: newMessage,
        is_internal: isInternal,
      });

      if (error) throw error;

      setNewMessage("");
      fetchMessages(selectedTicket.id);

      toast({
        title: "Message sent",
        description: isInternal ? "Internal note added" : "Reply sent to user",
      });
    } catch (error: unknown) {
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const filteredTickets =
    filterStatus === "all" ? tickets : tickets.filter((t) => t.status === filterStatus);

  const newCount = tickets.filter((t) => t.status === "new").length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;
  const urgentCount = tickets.filter((t) => t.priority === "urgent" && t.status !== "resolved" && t.status !== "closed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5" />
          <h2 className="text-2xl font-bold">Support Tickets</h2>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTickets} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold text-blue-500">{newCount}</div>
          <div className="text-sm text-muted-foreground">New Tickets</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-purple-500">{inProgressCount}</div>
          <div className="text-sm text-muted-foreground">In Progress</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-red-500">{urgentCount}</div>
          <div className="text-sm text-muted-foreground">Urgent</div>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tickets</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="waiting_user">Waiting on User</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tickets List */}
      <div className="space-y-3">
        {loading ? (
          <Card className="p-8 text-center">
            <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading tickets...</p>
          </Card>
        ) : filteredTickets.length === 0 ? (
          <Card className="p-8 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50 text-green-500" />
            <p className="text-muted-foreground">No tickets to display</p>
          </Card>
        ) : (
          filteredTickets.map((ticket) => (
            <Card
              key={ticket.id}
              className="p-4 hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => setSelectedTicket(ticket)}
            >
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg border ${priorityColors[ticket.priority]}`}>
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{ticket.subject}</span>
                    <Badge variant="outline" className={statusColors[ticket.status]}>
                      {ticket.status}
                    </Badge>
                    <Badge variant="outline">{ticket.priority}</Badge>
                    <Badge variant="secondary" className="text-xs">
                      {ticket.category}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {ticket.email || ticket.full_name || "Unknown"}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {ticket.message_count} messages
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTicket?.subject}</DialogTitle>
            <DialogDescription>
              From {selectedTicket?.email || selectedTicket?.full_name || "Unknown"} •{" "}
              {selectedTicket && formatDistanceToNow(new Date(selectedTicket.created_at), { addSuffix: true })}
            </DialogDescription>
          </DialogHeader>

          {selectedTicket && (
            <div className="space-y-4">
              {/* Status Controls */}
              <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                <Select
                  value={selectedTicket.status}
                  onValueChange={(value) => handleStatusChange(selectedTicket.id, value)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="waiting_user">Waiting on User</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className={priorityColors[selectedTicket.priority]}>
                  {selectedTicket.priority} priority
                </Badge>
                <Badge variant="secondary">{selectedTicket.category}</Badge>
              </div>

              {/* Original Message */}
              <Card className="p-4">
                <p className="text-sm whitespace-pre-wrap">{selectedTicket.description}</p>
                {Object.keys(selectedTicket.context).length > 0 && (
                  <details className="mt-4 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:underline">
                      View Context
                    </summary>
                    <pre className="mt-2 p-2 bg-muted rounded overflow-auto">
                      {JSON.stringify(selectedTicket.context, null, 2)}
                    </pre>
                  </details>
                )}
              </Card>

              {/* Messages */}
              <div className="space-y-3">
                <h4 className="font-semibold">Conversation</h4>
                {messages.map((msg) => (
                  <Card key={msg.id} className={`p-4 ${msg.is_internal ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium">
                            {msg.author_name || msg.author_email || "System"}
                          </span>
                          {msg.is_internal && (
                            <Badge variant="outline" className="text-xs">
                              Internal Note
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Reply */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Reply</h4>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded"
                    />
                    Internal note (not visible to user)
                  </label>
                </div>
                <Textarea
                  placeholder="Type your reply..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={4}
                />
                <Button onClick={handleSendMessage} disabled={!newMessage.trim()}>
                  <Send className="h-4 w-4 mr-2" />
                  Send Reply
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

