import { useRef } from "react";
import { Helmet } from "react-helmet-async";
import { useApp } from "@/contexts/AppContext";
import { FoodSuccessTracker } from "@/components/FoodSuccessTracker";
import { KidSelector } from "@/components/KidSelector";
import { ManageKidsDialog, ManageKidsDialogRef } from "@/components/ManageKidsDialog";
import { Button } from "@/components/ui/button";
import { Target, Settings } from "lucide-react";

export default function FoodTracker() {
  const { kids } = useApp();
  const manageKidsRef = useRef<ManageKidsDialogRef>(null);

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <Helmet>
        <title>Food Tracker - EatPal</title>
        <meta name="description" content="Track food attempts and build your child's confidence with new foods over time" />
        <meta name="robots" content="noindex" />
      </Helmet>
      {/* Page Header */}
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Food Tracker</h1>
            <p className="text-sm text-muted-foreground">
              Track food attempts and build confidence over time
            </p>
          </div>
        </div>

        {kids.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-48">
              <KidSelector />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => manageKidsRef.current?.openForEdit("")}
              title="Manage Children"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <FoodSuccessTracker onAddChild={() => manageKidsRef.current?.openForEdit("")} />

      <ManageKidsDialog ref={manageKidsRef} />
    </div>
  );
}
