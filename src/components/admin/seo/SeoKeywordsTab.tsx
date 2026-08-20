import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TabsContent } from '@/components/ui/tabs';
import type { Dispatch, SetStateAction } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  Globe,
  RefreshCw,
  Target,
  TrendingUp,
} from 'lucide-react';

/**
 * US-553: the keywords tab, lifted verbatim out of SEOManager.
 * Presentational and props-down; all state stays in SEOManager.
 */
/**
 * Structurally identical to SEOManager's local KeywordData. Declared here
 * rather than exported from the parent so this component does not import back
 * out of the file it was extracted from; TypeScript is structural, so the
 * parent's array still satisfies it.
 */
export interface KeywordRow {
  keyword: string;
  position: number;
  volume: number;
  difficulty: number;
  url: string;
  trend: 'up' | 'down' | 'stable';
  impressions?: number;
  clicks?: number;
  ctr?: number;
}

export interface SeoKeywordsTabProps {
  trackedKeywords: KeywordRow[];
  newKeyword: string;
  setNewKeyword: Dispatch<SetStateAction<string>>;
  addKeywordToTrack: () => void | Promise<void>;
  /** Google Search Console connection state and actions. */
  gscConnected: boolean;
  gscProperties: Record<string, unknown>[];
  gscSyncResults: Record<string, unknown> | null;
  selectedProperty: string;
  setSelectedProperty: Dispatch<SetStateAction<string>>;
  isConnectingGSC: boolean;
  isSyncingGSC: boolean;
  lastSyncedAt: string | null;
  connectToGSC: () => void | Promise<void>;
  disconnectGSC: () => void | Promise<void>;
  syncGSCData: () => void | Promise<void>;
}

export function SeoKeywordsTab({
  trackedKeywords,
  newKeyword,
  setNewKeyword,
  addKeywordToTrack,
  gscConnected,
  gscProperties,
  gscSyncResults,
  selectedProperty,
  setSelectedProperty,
  isConnectingGSC,
  isSyncingGSC,
  lastSyncedAt,
  connectToGSC,
  disconnectGSC,
  syncGSCData,
}: SeoKeywordsTabProps) {
  return (
<TabsContent value="keywords" className="space-y-4">
  {/* Google Search Console Card */}
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Google Search Console
          </CardTitle>
          <CardDescription>
            {gscConnected
              ? "Connected - Real data from Google"
              : "Connect to get real keyword data from Google"}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          {gscConnected ? (
            <>
              <Button
                onClick={syncGSCData}
                disabled={isSyncingGSC || !selectedProperty}
                variant="default"
                size="sm"
              >
                {isSyncingGSC ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync Data
                  </>
                )}
              </Button>
              <Button onClick={disconnectGSC} variant="outline" size="sm">
                Disconnect
              </Button>
            </>
          ) : (
            <Button onClick={connectToGSC} disabled={isConnectingGSC}>
              {isConnectingGSC ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Globe className="h-4 w-4 mr-2" />
                  Connect to GSC
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </CardHeader>
    {gscConnected && gscProperties.length > 0 && (
      <CardContent>
        <div className="flex items-center gap-4">
          <Label className="text-sm font-medium">Property:</Label>
          <Select value={selectedProperty} onValueChange={setSelectedProperty}>
            <SelectTrigger className="w-[400px]">
              <SelectValue placeholder="Select a property" />
            </SelectTrigger>
            <SelectContent>
              {gscProperties.map((prop) => (
                <SelectItem key={prop.id} value={prop.property_url}>
                  {prop.display_name || prop.property_url}
                  {prop.is_primary && (
                    <Badge variant="default" className="ml-2">
                      Primary
                    </Badge>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {lastSyncedAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Last synced: {new Date(lastSyncedAt).toLocaleString()}
            </div>
          )}
        </div>

        {gscSyncResults && (
          <div className="mt-4">
            {gscSyncResults.success ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-green-900 mb-1">Sync Complete</h4>
                    <p className="text-sm text-green-800">{gscSyncResults.message}</p>
                    {gscSyncResults.recordsSynced > 0 && (
                      <div className="mt-2">
                        <Badge variant="default">{gscSyncResults.recordsSynced} records synced</Badge>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-red-900 mb-1">Sync Failed</h4>
                    <p className="text-sm text-red-800">{gscSyncResults.error}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    )}
  </Card>

  {/* Keyword Tracking Card */}
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Target className="h-5 w-5" />
        Keyword Tracking
      </CardTitle>
      <CardDescription>
        Monitor keyword rankings and performance
        {gscConnected && <Badge className="ml-2">Real GSC Data</Badge>}
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Add keyword to track..."
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && addKeywordToTrack()}
        />
        <Button onClick={addKeywordToTrack}>Add</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Keyword</TableHead>
            <TableHead>Position</TableHead>
            {gscConnected && (
              <>
                <TableHead>Impressions</TableHead>
                <TableHead>Clicks</TableHead>
                <TableHead>CTR</TableHead>
              </>
            )}
            <TableHead>Volume</TableHead>
            <TableHead>Difficulty</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Trend</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trackedKeywords.map((kw, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-medium">{kw.keyword}</TableCell>
              <TableCell>
                <Badge variant={kw.position <= 3 ? "default" : kw.position <= 10 ? "secondary" : "outline"}>
                  #{kw.position}
                </Badge>
              </TableCell>
              {gscConnected && (
                <>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Eye className="h-3 w-3 text-muted-foreground" />
                      {kw.impressions?.toLocaleString() || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Target className="h-3 w-3 text-muted-foreground" />
                      {kw.clicks?.toLocaleString() || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {kw.ctr ? `${kw.ctr.toFixed(2)}%` : "—"}
                    </Badge>
                  </TableCell>
                </>
              )}
              <TableCell>{kw.volume?.toLocaleString() || "—"}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress value={kw.difficulty || 0} className="w-16 h-2" />
                  <span className="text-xs">{kw.difficulty || "—"}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{kw.url}</TableCell>
              <TableCell>
                {kw.trend === "up" && <TrendingUp className="h-4 w-4 text-green-600" />}
                {kw.trend === "down" && <TrendingUp className="h-4 w-4 text-red-600 rotate-180" />}
                {kw.trend === "stable" && <Activity className="h-4 w-4 text-muted-foreground" />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</TabsContent>
  );
}