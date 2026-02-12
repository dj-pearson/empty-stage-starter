import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  dateRange: { from: Date; to: Date };
  connections: any[];
}

export function InsightsAnomalies({ dateRange: _dateRange, connections: _connections }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Insights & Anomalies</CardTitle>
        <CardDescription>Automated insights and detected anomalies</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">Insights and anomalies will appear here</p>
      </CardContent>
    </Card>
  );
}
