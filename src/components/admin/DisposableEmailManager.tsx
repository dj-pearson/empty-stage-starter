import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, Trash2, Search, Upload, Ban } from "lucide-react";
import { logger } from "@/lib/logger";

type DisposableDomain = {
  id: string;
  domain: string;
  notes: string | null;
  source: "seed" | "admin" | "import";
  added_by: string | null;
  created_at: string;
  updated_at: string;
};

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

function isValidDomain(domain: string): boolean {
  return DOMAIN_REGEX.test(domain);
}

export const DisposableEmailManager = () => {
  const [domains, setDomains] = useState<DisposableDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Add-single dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Bulk-import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  // Delete confirmation
  const [pendingDelete, setPendingDelete] = useState<DisposableDomain | null>(null);

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase
      .from("disposable_email_domains") as any)
      .select("*")
      .order("domain", { ascending: true });

    if (error) {
      logger.error("Failed to fetch disposable email domains", error);
      toast.error("Error", { description: "Failed to load disposable email list." });
      setLoading(false);
      return;
    }

    setDomains((data as DisposableDomain[]) || []);
    setLoading(false);
  };

  const filteredDomains = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return domains;
    return domains.filter(
      (d) =>
        d.domain.includes(q) ||
        (d.notes?.toLowerCase().includes(q) ?? false) ||
        d.source.includes(q)
    );
  }, [domains, search]);

  const sourceCounts = useMemo(() => {
    return domains.reduce(
      (acc, d) => {
        acc[d.source] = (acc[d.source] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [domains]);

  const resetAddDialog = () => {
    setNewDomain("");
    setNewNotes("");
  };

  const handleAddDomain = async () => {
    const normalized = normalizeDomain(newDomain);

    if (!normalized) {
      toast.error("Invalid domain", { description: "Please enter a domain name." });
      return;
    }

    if (!isValidDomain(normalized)) {
      toast.error("Invalid domain", {
        description: `"${normalized}" is not a valid domain (e.g. example.com).`,
      });
      return;
    }

    if (domains.some((d) => d.domain === normalized)) {
      toast.error("Already blocked", {
        description: `${normalized} is already on the blocklist.`,
      });
      return;
    }

    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("disposable_email_domains") as any).insert({
      domain: normalized,
      notes: newNotes.trim() || null,
      source: "admin",
      added_by: userRes.user?.id ?? null,
    });

    setSaving(false);

    if (error) {
      logger.error("Failed to add disposable domain", error);
      toast.error("Failed to add", { description: error.message });
      return;
    }

    toast.success("Domain blocked", {
      description: `${normalized} will now be blocked from signup.`,
    });
    resetAddDialog();
    setAddOpen(false);
    fetchDomains();
  };

  const handleDeleteDomain = async () => {
    if (!pendingDelete) return;
    const toDelete = pendingDelete;
    setPendingDelete(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("disposable_email_domains") as any)
      .delete()
      .eq("id", toDelete.id);

    if (error) {
      logger.error("Failed to delete disposable domain", error);
      toast.error("Failed to remove", { description: error.message });
      return;
    }

    toast.success("Domain removed", {
      description: `${toDelete.domain} has been removed from the blocklist.`,
    });
    fetchDomains();
  };

  const handleBulkImport = async () => {
    const lines = importText
      .split(/\r?\n|,/)
      .map((l) => normalizeDomain(l))
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      toast.error("Nothing to import", {
        description: "Paste one domain per line (or comma-separated).",
      });
      return;
    }

    // De-duplicate within the paste
    const unique = Array.from(new Set(lines));

    // Filter out invalid domains and already-blocked entries
    const existingSet = new Set(domains.map((d) => d.domain));
    const invalid: string[] = [];
    const duplicates: string[] = [];
    const toInsert: { domain: string; source: "import"; added_by: string | null }[] = [];

    const { data: userRes } = await supabase.auth.getUser();
    const addedBy = userRes.user?.id ?? null;

    for (const domain of unique) {
      if (!isValidDomain(domain)) {
        invalid.push(domain);
        continue;
      }
      if (existingSet.has(domain)) {
        duplicates.push(domain);
        continue;
      }
      toInsert.push({ domain, source: "import", added_by: addedBy });
    }

    if (toInsert.length === 0) {
      toast.error("Nothing to import", {
        description: `All ${unique.length} entries were invalid or already blocked.`,
      });
      return;
    }

    setImporting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("disposable_email_domains") as any).insert(toInsert);
    setImporting(false);

    if (error) {
      logger.error("Failed to bulk-import disposable domains", error);
      toast.error("Import failed", { description: error.message });
      return;
    }

    const summary = [
      `Added ${toInsert.length} new domain${toInsert.length === 1 ? "" : "s"}.`,
      duplicates.length > 0 ? `${duplicates.length} already on list.` : null,
      invalid.length > 0 ? `${invalid.length} invalid and skipped.` : null,
    ]
      .filter(Boolean)
      .join(" ");

    toast.success("Import complete", { description: summary });
    setImportText("");
    setImportOpen(false);
    fetchDomains();
  };

  return (
    <div className="space-y-6">
      <div className="bg-muted/50 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <Ban className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-semibold">About the disposable email blocklist</h3>
            <p className="text-sm text-muted-foreground">
              Email addresses whose domain appears in this list will be blocked
              from signing up. The list ships with a baseline seed sourced from{" "}
              <a
                href="https://github.com/disposable-email-domains/disposable-email-domains"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
              >
                disposable-email-domains
              </a>
              . Use the actions below to add, remove, or bulk-import more
              entries.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search domain, notes, or source…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Dialog
          open={addOpen}
          onOpenChange={(open) => {
            setAddOpen(open);
            if (!open) resetAddDialog();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Domain
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Block a disposable email domain</DialogTitle>
              <DialogDescription>
                Any new signup whose email matches this domain will be rejected.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="new-domain">Domain</Label>
                <Input
                  id="new-domain"
                  placeholder="example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Enter just the domain — no protocol or leading "@".
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-notes">Notes (optional)</Label>
                <Input
                  id="new-notes"
                  placeholder="e.g. reported by support on 2026-04-10"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleAddDomain} disabled={saving}>
                {saving ? "Adding…" : "Add Domain"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Bulk Import
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Bulk import domains</DialogTitle>
              <DialogDescription>
                Paste one domain per line (or comma-separated). Invalid entries
                and existing domains will be skipped automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Textarea
                rows={12}
                placeholder={"mailinator.com\n10minutemail.com\ntempmail.io"}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                spellCheck={false}
                className="font-mono text-sm"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setImportOpen(false)}
                disabled={importing}
              >
                Cancel
              </Button>
              <Button onClick={handleBulkImport} disabled={importing}>
                {importing ? "Importing…" : "Import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">Total: {domains.length}</Badge>
        {sourceCounts.seed ? <Badge variant="outline">Seed: {sourceCounts.seed}</Badge> : null}
        {sourceCounts.admin ? (
          <Badge variant="outline">Admin: {sourceCounts.admin}</Badge>
        ) : null}
        {sourceCounts.import ? (
          <Badge variant="outline">Imported: {sourceCounts.import}</Badge>
        ) : null}
        {search ? <Badge>Showing {filteredDomains.length}</Badge> : null}
      </div>

      <div className="border rounded-lg">
        <ScrollArea className="h-[520px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Loading disposable email list…
                  </TableCell>
                </TableRow>
              ) : filteredDomains.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {search
                      ? `No domains match "${search}".`
                      : "No domains on the blocklist yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredDomains.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-sm">{d.domain}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          d.source === "seed"
                            ? "secondary"
                            : d.source === "admin"
                              ? "default"
                              : "outline"
                        }
                      >
                        {d.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate text-sm text-muted-foreground">
                      {d.notes ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(d.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(d)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this domain from the blocklist?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? (
                <>
                  <span className="font-mono">{pendingDelete.domain}</span> will
                  be allowed to sign up again. You can add it back at any time.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDomain}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
