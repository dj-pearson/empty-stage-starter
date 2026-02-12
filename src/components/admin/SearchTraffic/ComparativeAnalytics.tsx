import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  dateRange: { from: Date; to: Date };
  connections: any[];
}

export function ComparativeAnalytics({ dateRange: _dateRange, connections: _connections }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Comparison</CardTitle>
        <CardDescription>Compare metrics across platforms</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">Comparative analytics will appear here</p>
      </CardContent>
    </Card>
  );
}
