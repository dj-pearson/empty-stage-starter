import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Kid } from '@/types';

interface Props {
  kids: Kid[];
  selectedKidIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function SiblingPickerChips({ kids, selectedKidIds, onChange, disabled }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground mr-1">Cooking for:</span>
      <ToggleGroup
        type="multiple"
        value={selectedKidIds}
        onValueChange={(v) => onChange(v)}
        className="flex-wrap"
        aria-label="Select siblings to plan a meal for"
        disabled={disabled}
      >
        {kids.map((k) => (
          <ToggleGroupItem
            key={k.id}
            value={k.id}
            size="sm"
            className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {k.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
