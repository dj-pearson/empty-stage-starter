import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  dateRange: { from: Date; to: Date };
  connections: any[];
}

export function DeviceBrowserAnalytics({ dateRange, connections }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Device & Browser Analytics</CardTitle>
        <CardDescription>Traffic breakdown by device and browser</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">Device and browser data will appear here</p>
      </CardContent>
    </Card>
  );
}
