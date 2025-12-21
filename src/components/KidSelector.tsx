import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserCircle, ChevronDown, Users } from "lucide-react";
import { calculateAge } from "@/lib/utils";

export function KidSelector() {
  const { kids, activeKidId, setActiveKid } = useApp();
  const activeKid = kids.find(k => k.id === activeKidId);

  if (kids.length === 0) return null;

  const displayName = activeKidId === null ? "Family" : activeKid?.name || "Select Child";
  const isFamilyMode = activeKidId === null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 w-full justify-between">
          {isFamilyMode ? (
            <Users className="h-4 w-4" />
          ) : (
            <UserCircle className="h-4 w-4" />
          )}
          <span className="flex-1 text-left">{displayName}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 z-50 bg-popover">
        <DropdownMenuLabel>Select View</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setActiveKid(null)}
          className={isFamilyMode ? "bg-accent" : ""}
        >
          <Users className="h-4 w-4 mr-2" />
          Family
          {kids.length > 1 && (
            <span className="ml-auto text-xs text-muted-foreground">{kids.length} kids</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {kids.map(kid => {
          const age = calculateAge(kid.date_of_birth);
          return (
            <DropdownMenuItem
              key={kid.id}
              onClick={() => setActiveKid(kid.id)}
              className={activeKid?.id === kid.id ? "bg-accent" : ""}
            >
              <UserCircle className="h-4 w-4 mr-2" />
              {kid.name}
              {age !== null && <span className="ml-auto text-xs text-muted-foreground">Age {age}</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
