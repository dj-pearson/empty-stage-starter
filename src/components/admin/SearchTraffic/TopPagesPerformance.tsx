import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  dateRange: { from: Date; to: Date };
  connections: any[];
}

export function TopPagesPerformance({ dateRange, connections }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Pages Performance</CardTitle>
        <CardDescription>Most visited pages and their metrics</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">Page performance data will appear here</p>
      </CardContent>
    </Card>
  );
}
