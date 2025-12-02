import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoicesList } from "@/components/billing/InvoicesList";
import { PaymentMethods } from "@/components/billing/PaymentMethods";
import { SubscriptionOverview } from "@/components/billing/SubscriptionOverview";
import { CreditCard, FileText, Settings } from "lucide-react";

export default function Billing() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <>
      <Helmet>
        <title>Billing & Payments - EatPal</title>
        <meta name="description" content="Manage your subscription, payment methods, and view invoices" />
      </Helmet>

      <div className="container mx-auto p-6 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Billing & Payments</h1>
          <p className="text-muted-foreground">
            Manage your subscription, payment methods, and view your invoices.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Subscription</span>
            </TabsTrigger>
            <TabsTrigger value="payment-methods" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Payment Methods</span>
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Invoices</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <SubscriptionOverview />
          </TabsContent>

          <TabsContent value="payment-methods" className="space-y-6">
            <PaymentMethods />
          </TabsContent>

          <TabsContent value="invoices" className="space-y-6">
            <InvoicesList />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
