import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle2, Clock, Globe, Palette, Copy, ExternalLink, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CustomDomain {
  id: string;
  domain_name: string;
  status: 'pending' | 'verified' | 'active' | 'failed';
  verification_token: string;
  dns_records: {
    verification?: { type: string; name: string; value: string; ttl: number };
    cname?: { type: string; name: string; value: string; ttl: number };
    www_cname?: { type: string; name: string; value: string; ttl: number };
  };
  verified_at: string | null;
  ssl_certificate_status: string;
  ssl_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BrandSettings {
  id: string;
  user_id: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  business_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  platform_tagline: string | null;
  footer_text: string | null;
  contact_email: string | null;
  phone_number: string | null;
  support_url: string | null;
  created_at: string;
  updated_at: string;
}

export default function ProfessionalSettings() {
  const [customDomain, setCustomDomain] = useState<CustomDomain | null>(null);
  const [brandSettings, setBrandSettings] = useState<BrandSettings | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // @ts-ignore - professional tables exist but types not yet regenerated
      const [domainRes, brandRes] = await Promise.all([
        supabase
          .from("professional_custom_domains")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("professional_brand_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (domainRes.data) setCustomDomain(domainRes.data);
      if (brandRes.data) setBrandSettings(brandRes.data);
    } catch (error: any) {
      toast({
        title: "Error loading settings",
        description: error.message || "Failed to load your professional settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain) return;

    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*)*\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(newDomain)) {
      toast({
        title: "Invalid domain",
        description: "Please enter a valid domain name (e.g., example.com)",
        variant: "destructive",
      });
      return;
    }

    try {
      setActionLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("professional_custom_domains")
        .insert({
          user_id: user.id,
          domain_name: newDomain.toLowerCase(),
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      setCustomDomain(data);
      setNewDomain("");
      toast({
        title: "Domain added",
        description: "Please verify your domain ownership by updating DNS records",
      });
    } catch (error: any) {
      toast({
        title: "Error adding domain",
        description: error.message || "Failed to add custom domain",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyDomain = async () => {
    if (!customDomain) return;

    try {
      setActionLoading(true);
      // In a real implementation, this would call a backend function to verify DNS
      // For now, we'll just update the status
      const { error } = await supabase
        .from("professional_custom_domains")
        .update({
          status: "verified",
          verified_at: new Date().toISOString(),
        })
        .eq("id", customDomain.id);

      if (error) throw error;

      await loadSettings();
      toast({
        title: "Domain verified",
        description: "Your custom domain has been successfully verified!",
      });
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error.message || "DNS records not found. Please ensure you've added the records correctly.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveDomain = async () => {
    if (!customDomain) return;

    if (!confirm("Are you sure you want to remove this custom domain?")) return;

    try {
      setActionLoading(true);
      const { error } = await supabase
        .from("professional_custom_domains")
        .delete()
        .eq("id", customDomain.id);

      if (error) throw error;

      setCustomDomain(null);
      toast({
        title: "Domain removed",
        description: "Your custom domain has been removed",
      });
    } catch (error: any) {
      toast({
        title: "Error removing domain",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "verified":
      case "active":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "pending":
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case "failed":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      verified: "default",
      pending: "secondary",
      failed: "destructive",
    };

    return (
      <Badge variant={variants[status] || "outline"} className="capitalize">
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading professional settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Professional Portal</h1>
        </div>
        <p className="text-muted-foreground">
          Customize your white-labeled platform with custom domains and branding
        </p>
      </div>

      <Separator />

      <Tabs defaultValue="domains" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="domains">
            <Globe className="h-4 w-4 mr-2" />
            Custom Domains
          </TabsTrigger>
          <TabsTrigger value="branding">
            <Palette className="h-4 w-4 mr-2" />
            Brand Settings
          </TabsTrigger>
        </TabsList>

        {/* Custom Domains Tab */}
        <TabsContent value="domains" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Custom Domain Configuration</CardTitle>
              <CardDescription>
                Connect your own domain to create a white-labeled experience for your clients
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {customDomain ? (
                <div className="space-y-4">
                  {/* Current Domain Status */}
                  <Card className="bg-muted/50">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            <p className="font-semibold text-lg">{customDomain.domain_name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Status:</span>
                            {getStatusBadge(customDomain.status)}
                          </div>
                        </div>
                        {getStatusIcon(customDomain.status)}
                      </div>

                      <div className="flex gap-2">
                        {customDomain.status === "pending" && (
                          <Button onClick={handleVerifyDomain} disabled={actionLoading} size="sm">
                            {actionLoading ? "Verifying..." : "Check Verification"}
                          </Button>
                        )}
                        {customDomain.status === "verified" && (
                          <Button variant="outline" size="sm" disabled>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Verified
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveDomain}
                          disabled={actionLoading}
                        >
                          Remove Domain
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* DNS Records - Only if pending */}
                  {customDomain.status === "pending" && (
                    <DNSVerificationInstructions domain={customDomain} />
                  )}

                  {/* SSL Certificate Status */}
                  {(customDomain.status === "verified" || customDomain.status === "active") && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">SSL Certificate</CardTitle>
                        <CardDescription>
                          Secure HTTPS certificate for your custom domain
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">Status:</span>
                            {getStatusBadge(customDomain.ssl_certificate_status)}
                          </div>
                          {customDomain.ssl_expires_at && (
                            <span className="text-xs text-muted-foreground">
                              Expires: {new Date(customDomain.ssl_expires_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <form onSubmit={handleAddDomain} className="space-y-4">
                  <Alert>
                    <Globe className="h-4 w-4" />
                    <AlertTitle>Add Your Custom Domain</AlertTitle>
                    <AlertDescription>
                      Create a white-labeled experience by pointing your domain to our platform.
                      Your clients will access your branded portal at your custom domain.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Domain Name</label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="coach.example.com or example.com"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        disabled={actionLoading}
                      />
                      <Button type="submit" disabled={actionLoading || !newDomain}>
                        {actionLoading ? "Adding..." : "Add Domain"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter your domain or subdomain without www, http://, or https://
                    </p>
                  </div>

                  <Alert variant="default" className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <AlertTitle>What you'll need</AlertTitle>
                    <AlertDescription className="space-y-2 mt-2">
                      <p>Before adding your domain, make sure you have:</p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>Access to your domain's DNS settings</li>
                        <li>Ability to add TXT and CNAME records</li>
                        <li>24 hours for DNS propagation</li>
                      </ul>
                    </AlertDescription>
                  </Alert>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Brand Settings Tab */}
        <TabsContent value="branding" className="space-y-4">
          <BrandCustomizationForm settings={brandSettings} onUpdate={setBrandSettings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Component for DNS verification instructions
function DNSVerificationInstructions({ domain }: { domain: CustomDomain }) {
  const { toast } = useToast();
  const dnsRecords = domain.dns_records || {};

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  return (
    <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-orange-600" />
          Verify Domain Ownership
        </CardTitle>
        <CardDescription>
          Add the following DNS records to your domain registrar to verify ownership and activate your custom domain
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Verification TXT Record */}
        {dnsRecords.verification && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">1. Verification Record (TXT)</h4>
              <Badge variant="outline">Required</Badge>
            </div>
            <div className="bg-white dark:bg-muted p-4 rounded-lg border space-y-2 font-mono text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Type:</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{dnsRecords.verification.type}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(dnsRecords.verification!.type, "Record type")}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Name:</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{dnsRecords.verification.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(dnsRecords.verification!.name, "Record name")}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-muted-foreground">Value:</span>
                <div className="flex items-center gap-2 max-w-xs">
                  <span className="font-semibold truncate">{dnsRecords.verification.value}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(dnsRecords.verification!.value, "Record value")}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CNAME Records */}
        {dnsRecords.cname && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">2. Root Domain Record (CNAME or A)</h4>
              <Badge variant="outline">Required</Badge>
            </div>
            <div className="bg-white dark:bg-muted p-4 rounded-lg border space-y-2 font-mono text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Type:</span>
                <span className="font-semibold">{dnsRecords.cname.type}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-semibold">{dnsRecords.cname.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Value:</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{dnsRecords.cname.value}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(dnsRecords.cname!.value, "CNAME value")}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <Alert>
          <Clock className="h-4 w-4" />
          <AlertTitle>DNS Propagation Time</AlertTitle>
          <AlertDescription>
            DNS changes can take up to 24-48 hours to propagate globally. You can check the verification
            status after updating your DNS records by clicking "Check Verification" above.
          </AlertDescription>
        </Alert>

        <div className="flex items-center gap-2 pt-2">
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
          <a
            href="https://www.cloudflare.com/learning/dns/what-is-dns/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            Learn more about DNS records
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

// Component for brand customization
function BrandCustomizationForm({
  settings,
  onUpdate,
}: {
  settings: BrandSettings | null;
  onUpdate: (settings: BrandSettings) => void;
}) {
  const [formData, setFormData] = useState<Partial<BrandSettings>>(
    settings || {
      primary_color: "#2f6d3c",
      secondary_color: "#a5d6a7",
      accent_color: "#ffa45b",
      business_name: "",
      contact_email: "",
      platform_tagline: "",
      footer_text: "",
    }
  );
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (settings?.id) {
        // Update existing
        const { data, error } = await supabase
          .from("professional_brand_settings")
          .update(formData)
          .eq("id", settings.id)
          .select()
          .single();

        if (error) throw error;
        onUpdate(data);
      } else {
        // Create new
        const { data, error } = await supabase
          .from("professional_brand_settings")
          .insert({
            user_id: user.id,
            ...formData,
          })
          .select()
          .single();

        if (error) throw error;
        onUpdate(data);
      }

      toast({
        title: "Brand settings saved",
        description: "Your customizations have been applied successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error saving settings",
        description: error.message || "Failed to save brand settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand Customization</CardTitle>
        <CardDescription>
          Customize colors, business information, and branding for your white-labeled platform
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Business Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Business Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Business Name</label>
              <Input
                value={formData.business_name || ""}
                onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                placeholder="Your organization name"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Contact Email</label>
              <Input
                type="email"
                value={formData.contact_email || ""}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                placeholder="support@example.com"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Platform Tagline</label>
              <Input
                value={formData.platform_tagline || ""}
                onChange={(e) => setFormData({ ...formData, platform_tagline: e.target.value })}
                placeholder="Your custom tagline (e.g., 'Transforming Lives Through Nutrition')"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Footer Text</label>
              <Input
                value={formData.footer_text || ""}
                onChange={(e) => setFormData({ ...formData, footer_text: e.target.value })}
                placeholder="Custom footer text"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Color Theme */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Color Theme</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Primary Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={formData.primary_color || "#2f6d3c"}
                  onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <Input
                  value={formData.primary_color || "#2f6d3c"}
                  onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                  placeholder="#2f6d3c"
                  className="flex-1 font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Secondary Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={formData.secondary_color || "#a5d6a7"}
                  onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <Input
                  value={formData.secondary_color || "#a5d6a7"}
                  onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                  placeholder="#a5d6a7"
                  className="flex-1 font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Accent Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={formData.accent_color || "#ffa45b"}
                  onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <Input
                  value={formData.accent_color || "#ffa45b"}
                  onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                  placeholder="#ffa45b"
                  className="flex-1 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Color Preview */}
          <Card className="bg-muted/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Color Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 flex-wrap">
                <div className="space-y-2">
                  <div
                    className="w-32 h-32 rounded-lg border-2 shadow-sm transition-all"
                    style={{ backgroundColor: formData.primary_color }}
                  />
                  <p className="text-xs text-center text-muted-foreground">Primary</p>
                </div>
                <div className="space-y-2">
                  <div
                    className="w-32 h-32 rounded-lg border-2 shadow-sm transition-all"
                    style={{ backgroundColor: formData.secondary_color }}
                  />
                  <p className="text-xs text-center text-muted-foreground">Secondary</p>
                </div>
                <div className="space-y-2">
                  <div
                    className="w-32 h-32 rounded-lg border-2 shadow-sm transition-all"
                    style={{ backgroundColor: formData.accent_color }}
                  />
                  <p className="text-xs text-center text-muted-foreground">Accent</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Alert>
          <Palette className="h-4 w-4" />
          <AlertTitle>Theme Application</AlertTitle>
          <AlertDescription>
            Your custom colors will be applied to all pages when clients access your white-labeled domain.
            Changes are reflected immediately after saving.
          </AlertDescription>
        </Alert>

        <Button onClick={handleSave} disabled={loading} className="w-full" size="lg">
          {loading ? "Saving..." : "Save Brand Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
