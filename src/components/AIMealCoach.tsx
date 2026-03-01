import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MessageCircle,
  Send,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  Bot,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { format } from "date-fns";
import { cn, calculateAge } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  conversation_title: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

export function AIMealCoach() {
  const { activeKidId, kids, foods, planEntries, recipes } = useApp();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeKid = kids.find((k) => k.id === activeKidId);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (activeConversation) {
      loadMessages(activeConversation);
    }
  }, [activeConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadConversations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("ai_coach_conversations")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      setConversations((data || []).map(conv => ({
        id: conv.id,
        conversation_title: conv.conversation_title || "New Conversation",
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        is_archived: conv.is_archived || false
      })));
    } catch (error: unknown) {
      logger.error("Error loading conversations:", error);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("ai_coach_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      setMessages((data || []).map(msg => ({
        id: msg.id,
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
        created_at: msg.created_at
      })));
    } catch (error: unknown) {
      logger.error("Error loading messages:", error);
      toast.error("Failed to load conversation");
    } finally {
      setLoading(false);
    }
  };

  const createNewConversation = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("ai_coach_conversations")
        .insert([
          {
            user_id: user.id,
            kid_id: activeKidId,
            conversation_title: "New Conversation",
          },
        ])
        .select()
        .single();

      if (error) throw error;

      setConversations([data, ...conversations]);
      setActiveConversation(data.id);
      setMessages([]);
      toast.success("New conversation started!");
    } catch (error: unknown) {
      logger.error("Error creating conversation:", error);
      toast.error("Failed to create conversation");
    }
  };

  const requestDeleteConversation = (conversationId: string) => {
    setPendingDeleteId(conversationId);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteConversation = async () => {
    if (!pendingDeleteId) return;
    const conversationId = pendingDeleteId;
    setShowDeleteConfirm(false);
    setPendingDeleteId(null);

    try {
      const { error } = await supabase
        .from("ai_coach_conversations")
        .delete()
        .eq("id", conversationId);

      if (error) throw error;

      setConversations(conversations.filter((c) => c.id !== conversationId));
      if (activeConversation === conversationId) {
        setActiveConversation(null);
        setMessages([]);
      }
      toast.success("Conversation deleted");
    } catch (error: unknown) {
      logger.error("Error deleting conversation:", error);
      toast.error("Failed to delete conversation");
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !activeConversation) return;

    const userMessage = inputMessage.trim();
    setInputMessage("");
    setSending(true);

    try {
      // Add user message to UI immediately
      const tempUserMessage: Message = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: userMessage,
        created_at: new Date().toISOString(),
      };
      setMessages([...messages, tempUserMessage]);

      // Save user message to database
      const { data: savedUserMessage, error: userError } = await supabase
        .from("ai_coach_messages")
        .insert([
          {
            conversation_id: activeConversation,
            role: "user",
            content: userMessage,
          },
        ])
        .select()
        .single();

      if (userError) throw userError;

      // Build context for AI
      const context = {
        kid: activeKid
          ? {
              name: activeKid.name,
              age: calculateAge(activeKid.date_of_birth),
              allergens: activeKid.allergens,
            }
          : null,
        safe_foods: foods.filter((f) => f.is_safe).map((f) => f.name),
        try_bites: foods.filter((f) => f.is_try_bite).map((f) => f.name),
        recent_meals: planEntries.slice(0, 7).map((p) => ({
          date: p.date,
          meal: p.meal_slot,
        })),
        recipe_count: recipes.length,
      };

      // Prepare kid context for the edge function
      const activeKidAge = activeKid ? calculateAge(activeKid.date_of_birth) : null;
      const kidContext = activeKid ? {
        name: activeKid.name,
        age: activeKidAge,
        allergens: activeKid.allergens || [],
        safeFoodsCount: context.safe_foods.length,
        tryBiteFoodsCount: context.try_bites.length,
      } : null;

      // Call secure edge function instead of direct API
      const startTime = Date.now();
      const { data: result, error: aiError } = await supabase.functions.invoke('ai-coach-chat', {
        body: {
          messages: [
            ...messages
              .filter((m) => m.role !== "system")
              .map((m) => ({
                role: m.role,
                content: m.content,
              })),
            {
              role: "user",
              content: userMessage,
            },
          ],
          kidContext,
          maxTokens: 2000,
        },
      });

      if (aiError) {
        throw new Error(aiError.message || "AI request failed");
      }

      if (!result || !result.message) {
        throw new Error("Invalid AI response");
      }

      const aiResponse = result.message;
      const responseTime = Date.now() - startTime;

      // Save AI response to database
      const { data: savedAIMessage, error: aiMessageError } = await supabase
        .from("ai_coach_messages")
        .insert([
          {
            conversation_id: activeConversation,
            role: "assistant",
            content: aiResponse,
            context_snapshot: context,
            model_used: result.model || 'claude-3-5-sonnet-20241022',
            tokens_used: result.usage?.totalTokens || 0,
            response_time_ms: responseTime,
          },
        ])
        .select()
        .single();

      if (aiMessageError) throw aiMessageError;

      // Update conversation title if it's the first message
      if (messages.length === 0 || conversations.find((c) => c.id === activeConversation)?.conversation_title === "New Conversation") {
        const title = userMessage.slice(0, 50) + (userMessage.length > 50 ? "..." : "");
        await supabase
          .from("ai_coach_conversations")
          .update({ conversation_title: title })
          .eq("id", activeConversation);

        // Update local state
        setConversations(
          conversations.map((c) =>
            c.id === activeConversation ? { ...c, conversation_title: title } : c
          )
        );
      }

      // Add AI response to UI with proper type casting
      const typedUserMessage: Message = {
        id: savedUserMessage.id,
        role: savedUserMessage.role as "user" | "assistant" | "system",
        content: savedUserMessage.content,
        created_at: savedUserMessage.created_at
      };
      
      const typedAIMessage: Message = {
        id: savedAIMessage.id,
        role: savedAIMessage.role as "user" | "assistant" | "system",
        content: savedAIMessage.content,
        created_at: savedAIMessage.created_at
      };
      
      setMessages([
        ...messages.filter((m) => m.id !== tempUserMessage.id),
        typedUserMessage,
        typedAIMessage,
      ]);

      toast.success("AI Coach responded!");
    } catch (error: unknown) {
      logger.error("Error sending message:", error);
      const msg = error instanceof Error ? error.message : "Failed to send message. Check AI settings.";
      toast.error(msg);
      // Remove the temporary message on error
      setMessages(messages.filter((m) => !m.id.startsWith("temp-")));
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="grid md:grid-cols-4 gap-6 h-[calc(100vh-200px)]">
      {/* Conversations Sidebar */}
      <Card className="md:col-span-1">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Conversations</CardTitle>
            <Button onClick={createNewConversation} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="space-y-2">
              {conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No conversations yet
                </p>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConversation(conv.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all",
                      activeConversation === conv.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted"
                    )}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-sm font-medium line-clamp-1">
                        {conv.conversation_title}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestDeleteConversation(conv.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(conv.updated_at), "MMM d, h:mm a")}
                    </p>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Chat Area */}
      <Card className="md:col-span-3 flex flex-col">
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Meal Coach
              </CardTitle>
              <CardDescription>
                {activeKid
                  ? `Helping with ${activeKid.name}'s meals`
                  : "Your personal meal planning assistant"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0">
          {!activeConversation ? (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <MessageCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">Start a Conversation</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md">
                  Ask me anything about meal planning, picky eating strategies, recipe ideas, or
                  nutrition advice!
                </p>
                <Button onClick={createNewConversation}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Conversation
                </Button>

                <div className="mt-8 text-left max-w-md mx-auto">
                  <p className="text-sm font-semibold mb-2">Try asking:</p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>"My child won't eat vegetables, what should I do?"</li>
                    <li>"Quick lunch ideas for a picky eater"</li>
                    <li>"How can I introduce new foods gradually?"</li>
                    <li>"Healthy snack options for toddlers"</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Messages */}
              <ScrollArea className="flex-1 p-6">
                {loading && messages.length === 0 ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <p>Start the conversation by sending a message below!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-3",
                          message.role === "user" ? "justify-end" : "justify-start"
                        )}
                      >
                        {message.role === "assistant" && (
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Bot className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        <div
                          className={cn(
                            "max-w-[80%] rounded-lg px-4 py-3",
                            message.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          <p className="text-xs opacity-70 mt-2">
                            {format(new Date(message.created_at), "h:mm a")}
                          </p>
                        </div>
                        {message.role === "user" && (
                          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                            <User className="h-5 w-5 text-accent" />
                          </div>
                        )}
                      </div>
                    ))}
                    {sending && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-5 w-5 text-primary" />
                        </div>
                        <div className="bg-muted rounded-lg px-4 py-3">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Input */}
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask me anything about meal planning..."
                    disabled={sending}
                    className="flex-1"
                  />
                  <Button onClick={sendMessage} disabled={sending || !inputMessage.trim()}>
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              conversation and all its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteConversation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
