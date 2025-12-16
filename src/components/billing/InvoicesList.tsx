import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Download,
  MoreHorizontal,
  FileText,
  Mail,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  stripeInvoiceId: string | null;
  hasStripeInvoice: boolean;
}

export function InvoicesList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const { data, error } = await invokeEdgeFunction("generate-invoice", {
        body: { action: "list" },
      });

      if (error) throw error;

      setInvoices(data.invoices || []);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  const handleViewInvoice = async (invoice: Invoice) => {
    try {
      setActionLoading(invoice.id);

      const { data, error } = await invokeEdgeFunction("generate-invoice", {
        body: { action: "generate", paymentId: invoice.id },
      });

      if (error) throw error;

      // Open HTML invoice in new tab
      const blob = new Blob([data.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");

      // Cleanup URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Error generating invoice:", err);
      toast.error("Failed to generate invoice");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadPdf = async (invoice: Invoice) => {
    try {
      setActionLoading(invoice.id);

      if (invoice.hasStripeInvoice && invoice.stripeInvoiceId) {
        // Get Stripe-hosted PDF
        const { data, error } = await invokeEdgeFunction("generate-invoice", {
          body: { action: "download-stripe", invoiceId: invoice.stripeInvoiceId },
        });

        if (error) throw error;

        if (data.pdfUrl) {
          window.open(data.pdfUrl, "_blank");
        } else {
          toast.error("PDF not available from Stripe");
        }
      } else {
        // Generate HTML invoice and trigger print dialog
        const { data, error } = await invokeEdgeFunction("generate-invoice", {
          body: { action: "generate", paymentId: invoice.id },
        });

        if (error) throw error;

        // Open in new window and trigger print
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(data.html);
          printWindow.document.close();
          printWindow.onload = () => {
            printWindow.print();
          };
        }
      }
    } catch (err) {
      console.error("Error downloading invoice:", err);
      toast.error("Failed to download invoice");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendEmail = async (invoice: Invoice) => {
    try {
      setActionLoading(invoice.id);

      const { data, error } = await invokeEdgeFunction("generate-invoice", {
        body: { action: "send", paymentId: invoice.id },
      });

      if (error) throw error;

      toast.success(data.message || "Invoice sent to your email");
    } catch (err) {
      console.error("Error sending invoice:", err);
      toast.error("Failed to send invoice");
    } finally {
      setActionLoading(null);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toLowerCase(),
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Your payment history and invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Your payment history and invoices</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={fetchInvoices}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No invoices found</p>
            <p className="text-sm">Invoices will appear here after your first payment</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell>{formatDate(invoice.date)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {invoice.description}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(invoice.amount, invoice.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          invoice.status === "succeeded"
                            ? "default"
                            : invoice.status === "pending"
                            ? "secondary"
                            : "destructive"
                        }
                        className={
                          invoice.status === "succeeded"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                            : ""
                        }
                      >
                        {invoice.status === "succeeded" ? "Paid" : invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={actionLoading === invoice.id}
                          >
                            {actionLoading === invoice.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewInvoice(invoice)}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View Invoice
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownloadPdf(invoice)}>
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSendEmail(invoice)}>
                            <Mail className="h-4 w-4 mr-2" />
                            Send to Email
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
