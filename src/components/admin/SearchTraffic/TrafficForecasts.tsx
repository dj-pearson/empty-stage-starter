import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  dateRange: { from: Date; to: Date };
  connections: any[];
}

export function TrafficForecasts({ dateRange, connections }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Traffic Forecasts</CardTitle>
        <CardDescription>Predicted traffic based on historical trends</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">Traffic forecasts will appear here</p>
      </CardContent>
    </Card>
  );
}
