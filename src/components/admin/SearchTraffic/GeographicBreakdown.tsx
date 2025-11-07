import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  dateRange: { from: Date; to: Date };
  connections: any[];
}

export function GeographicBreakdown({ dateRange, connections }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Geographic Breakdown</CardTitle>
        <CardDescription>Traffic by country and region</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">Geographic data will appear here</p>
      </CardContent>
    </Card>
  );
}
