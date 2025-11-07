import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  dateRange: { from: Date; to: Date };
  connections: any[];
}

export function QueryPerformance({ dateRange, connections }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Query Performance</CardTitle>
        <CardDescription>Top performing search queries</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">Query performance data will appear here</p>
      </CardContent>
    </Card>
  );
}
