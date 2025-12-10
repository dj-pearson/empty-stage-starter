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
import { UserCircle, ChevronDown } from "lucide-react";

export function KidSelector() {
  const { kids, activeKidId, setActiveKid } = useApp();
  const activeKid = kids.find(k => k.id === activeKidId);

  if (kids.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <UserCircle className="h-4 w-4" />
          <span className="hidden sm:inline">{activeKid?.name || "Select Child"}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Select Child</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {kids.map(kid => (
          <DropdownMenuItem
            key={kid.id}
            onClick={() => setActiveKid(kid.id)}
            className={activeKid?.id === kid.id ? "bg-accent" : ""}
          >
            <UserCircle className="h-4 w-4 mr-2" />
            {kid.name}
            {kid.age && <span className="ml-auto text-xs text-muted-foreground">Age {kid.age}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
