// @ts-nocheck
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { toast } from "sonner";
import { Chrome, Search, Globe, CheckCircle, XCircle, Loader2, Unplug } from "lucide-react";

interface Platform {
  id: string;
  name: string;
  platform: string;
  description: string;
  icon: any;
  color: string;
}

const PLATFORMS: Platform[] = [
  {
    id: "google_analytics",
    name: "Google Analytics 4",
    platform: "google_analytics",
    description: "Track website traffic, user behavior, and conversions",
    icon: Chrome,
    color: "text-blue-600",
  },
  {
    id: "google_search_console",
    name: "Google Search Console",
    platform: "google_search_console",
    description: "Monitor search performance, queries, and rankings",
    icon: Search,
    color: "text-green-600",
  },
  {
    id: "bing_webmaster",
    name: "Bing Webmaster Tools",
    platform: "bing_webmaster",
    description: "Track Bing search visibility and performance",
    icon: Globe,
    color: "text-orange-600",
  },
  {
    id: "yandex_webmaster",
    name: "Yandex Webmaster",
    platform: "yandex_webmaster",
    description: "Monitor Yandex search performance",
    icon: Globe,
    color: "text-red-600",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PlatformConnectionManager({ open, onClose }: Props) {
  const [connections, setConnections] = useState<any[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchConnections();
    }
  }, [open]);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("analytics_platform_connections")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (error) throw error;
      setConnections(data || []);
    } catch (error: any) {
      console.error("Error fetching connections:", error);
      toast.error("Failed to load connections");
    } finally {
      setLoading(false);
    }
  };

  const isConnected = (platform: string) => {
    return connections.some(c => c.platform === platform);
  };

  const getConnection = (platform: string) => {
    return connections.find(c => c.platform === platform);
  };

  const handleConnect = async (platform: string) => {
    setConnecting(platform);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let functionName = "";
      switch (platform) {
        case "google_analytics":
          functionName = "ga4-oauth";
          break;
        case "google_search_console":
          functionName = "gsc-oauth";
          break;
        case "bing_webmaster":
          functionName = "bing-webmaster-oauth";
          break;
        case "yandex_webmaster":
          functionName = "yandex-webmaster-oauth";
          break;
        default:
          throw new Error("Unknown platform");
      }

      const response = await invokeEdgeFunction(functionName, {
        body: {
          action: "initiate",
          userId: user.id,
        },
      });

      if (response.error) throw response.error;

      const { authUrl } = response.data;

      // Open OAuth flow in popup or redirect
      window.location.href = authUrl;
    } catch (error: any) {
      console.error("Error connecting platform:", error);
      toast.error(error.message || "Failed to connect platform");
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (platform: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let functionName = "";
      switch (platform) {
        case "google_analytics":
          functionName = "ga4-oauth";
          break;
        case "google_search_console":
          functionName = "gsc-oauth";
          break;
        case "bing_webmaster":
          functionName = "bing-webmaster-oauth";
          break;
        case "yandex_webmaster":
          functionName = "yandex-webmaster-oauth";
          break;
        default:
          throw new Error("Unknown platform");
      }

      const response = await invokeEdgeFunction(functionName, {
        body: {
          action: "disconnect",
          userId: user.id,
        },
      });

      if (response.error) throw response.error;

      toast.success("Platform disconnected successfully");
      fetchConnections();
    } catch (error: any) {
      console.error("Error disconnecting platform:", error);
      toast.error(error.message || "Failed to disconnect platform");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Platform Connections</DialogTitle>
          <DialogDescription>
            Connect your analytics platforms to start tracking your search traffic
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {PLATFORMS.map((platform) => {
            const connected = isConnected(platform.platform);
            const connection = getConnection(platform.platform);
            const Icon = platform.icon;

            return (
              <Card key={platform.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg bg-gray-100`}>
                        <Icon className={`h-6 w-6 ${platform.color}`} />
                      </div>
                      <div>
                        <CardTitle className="text-base">{platform.name}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {platform.description}
                        </CardDescription>
                      </div>
                    </div>
                    {connected ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50">
                        <XCircle className="h-3 w-3 mr-1" />
                        Not Connected
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {connected && connection && (
                    <div className="mb-3 p-3 bg-gray-50 rounded-lg text-xs space-y-1">
                      <div>
                        <span className="font-medium">Account:</span>{" "}
                        {connection.platform_account_name || "Not selected"}
                      </div>
                      <div>
                        <span className="font-medium">Last Sync:</span>{" "}
                        {connection.last_sync_at
                          ? new Date(connection.last_sync_at).toLocaleString()
                          : "Never"}
                      </div>
                      <div>
                        <span className="font-medium">Status:</span>{" "}
                        <span
                          className={
                            connection.sync_status === "success"
                              ? "text-green-600"
                              : connection.sync_status === "error"
                              ? "text-red-600"
                              : "text-gray-600"
                          }
                        >
                          {connection.sync_status || "Unknown"}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {connected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleDisconnect(platform.platform)}
                      >
                        <Unplug className="h-4 w-4 mr-2" />
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => handleConnect(platform.platform)}
                        disabled={connecting === platform.platform}
                      >
                        {connecting === platform.platform ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Connect
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-semibold text-sm mb-2">Getting Started</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Click "Connect" to authorize each platform using OAuth</li>
            <li>• You'll be redirected to the platform's login page</li>
            <li>• After authorization, you'll be redirected back to this dashboard</li>
            <li>• Data will sync automatically every hour, or you can manually sync anytime</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
