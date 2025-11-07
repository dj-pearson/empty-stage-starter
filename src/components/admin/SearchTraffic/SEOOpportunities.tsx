import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  dateRange: { from: Date; to: Date };
  connections: any[];
}

export function SEOOpportunities({ dateRange, connections }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>SEO Opportunities</CardTitle>
        <CardDescription>Detected opportunities to improve rankings</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">SEO opportunities will appear here</p>
      </CardContent>
    </Card>
  );
}
