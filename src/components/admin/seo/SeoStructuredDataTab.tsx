import { useState } from 'react';
import {
  Link as LinkIcon,
  Copy,
  Download,
  CheckCircle,
  RefreshCw,
  Info,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { logger } from '@/lib/logger';

/**
 * The Structured Data (JSON-LD) tab, extracted from the 5.6k-line SEOManager
 * (US-553 AC1). State stays in the parent and is passed down as props; the
 * inline validate handler is moved verbatim with its dependencies, so behavior
 * is unchanged.
 */
export interface SeoStructuredDataTabProps {
  structuredData: Record<string, unknown>;
  setStructuredData: (value: Record<string, unknown>) => void;
  onCopy: (content: string, label: string) => void;
  onDownload: (content: string, filename: string) => void;
}

export function SeoStructuredDataTab({
  structuredData,
  setStructuredData,
  onCopy,
  onDownload,
}: SeoStructuredDataTabProps) {
  // US-553: the validation result is this tab's own -- SEOManager only relayed
  // it. Radix keeps every TabsContent mounted, so it survives tab switches.
  const [isValidatingStructuredData, setIsValidatingStructuredData] = useState(false);
  const [structuredDataValidationResults, setStructuredDataValidationResults] = useState<Record<
    string,
    unknown
  > | null>(null);

  return (
    <TabsContent value="structured">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Structured Data (JSON-LD)
          </CardTitle>
          <CardDescription>
            Add this schema.org markup to your index.html for rich search results
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={JSON.stringify(structuredData, null, 2)}
            onChange={(e) => {
              try {
                setStructuredData(JSON.parse(e.target.value));
              } catch (_err) {
                // Invalid JSON, ignore
              }
            }}
            rows={20}
            className="font-mono text-sm"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => onCopy(JSON.stringify(structuredData, null, 2), 'Structured Data')}
              variant="outline"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy to Clipboard
            </Button>
            <Button
              onClick={() =>
                onDownload(JSON.stringify(structuredData, null, 2), 'structured-data.json')
              }
              variant="outline"
            >
              <Download className="h-4 w-4 mr-2" />
              Download File
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>
              <strong>How to add to your site:</strong>
            </p>
            <ol className="list-decimal list-inside space-y-1 mt-2">
              <li>Copy the JSON-LD code above</li>
              <li>Open your index.html file</li>
              <li>
                Add this inside the {'<head>'} section:
                <code className="block mt-1 p-2 bg-muted rounded text-xs">
                  {'<script type="application/ld+json">'}
                  <br />
                  {'  /* Paste JSON here */'}
                  <br />
                  {'</script>'}
                </code>
              </li>
            </ol>
          </div>

          <Separator className="my-6" />

          {/* Structured Data Validator Section */}
          <div className="space-y-4 pt-4">
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Validate Existing Structured Data
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Check any page for valid Schema.org JSON-LD markup
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="validate-structured-url">Page URL to Validate</Label>
              <Input
                id="validate-structured-url"
                type="url"
                placeholder={`${window.location.origin}/`}
                defaultValue={`${window.location.origin}/`}
              />
            </div>

            <Button
              className="w-full"
              disabled={isValidatingStructuredData}
              onClick={async () => {
                const urlInput = document.getElementById(
                  'validate-structured-url'
                ) as HTMLInputElement;
                const url = urlInput?.value || `${window.location.origin}/`;

                setIsValidatingStructuredData(true);
                setStructuredDataValidationResults(null);

                try {
                  const { data } = await invokeEdgeFunction('validate-structured-data', {
                    body: { url },
                  });

                  if (data?.success) {
                    setStructuredDataValidationResults({
                      success: true,
                      data: data.data,
                    });
                    logger.debug('Full structured data validation:', data.data);
                  } else {
                    throw new Error(data?.error || 'Failed to validate structured data');
                  }
                } catch (error: unknown) {
                  setStructuredDataValidationResults({
                    success: false,
                    error: error.message || 'Failed to validate structured data',
                  });
                } finally {
                  setIsValidatingStructuredData(false);
                }
              }}
            >
              {isValidatingStructuredData ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Validate Structured Data
                </>
              )}
            </Button>

            <div className="rounded-lg border p-4 bg-muted/50">
              <p className="text-sm text-muted-foreground">
                <Info className="h-4 w-4 inline mr-2" />
                Validates JSON-LD structured data against Schema.org standards. Checks 15+ types
                including Article, Recipe, Product, Organization, and more.
              </p>
            </div>

            <div className="text-sm text-muted-foreground">
              <h4 className="font-semibold mb-2">Validation Checks:</h4>
              <ul className="space-y-1 ml-4">
                <li>✅ JSON-LD syntax validation</li>
                <li>✅ Required properties for each type</li>
                <li>✅ Date format validation (ISO 8601)</li>
                <li>✅ URL format validation</li>
                <li>✅ Breadcrumb structure</li>
                <li>✅ Review and rating validation</li>
                <li>✅ Recipe, Product, Article validation</li>
              </ul>
            </div>

            {structuredDataValidationResults && (
              <div className="mt-4">
                {structuredDataValidationResults.success ? (
                  <Card className="border-green-200 bg-green-50">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3 mb-4">
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-green-900 mb-1">Validation Complete</h4>
                          <p className="text-sm text-green-800">
                            Structured data{' '}
                            {structuredDataValidationResults.data.hasStructuredData
                              ? 'found'
                              : 'not found'}{' '}
                            on this page
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-card rounded p-3">
                          <div className="text-sm text-muted-foreground">Overall Score</div>
                          <div className="text-2xl font-bold text-green-600">
                            {structuredDataValidationResults.data.overallScore}/100
                          </div>
                        </div>
                        <div className="bg-card rounded p-3">
                          <div className="text-sm text-muted-foreground">Total Items</div>
                          <div className="text-2xl font-bold">
                            {structuredDataValidationResults.data.totalItems}
                          </div>
                        </div>
                        <div className="bg-card rounded p-3">
                          <div className="text-sm text-muted-foreground">Valid Items</div>
                          <div className="text-2xl font-bold text-green-600">
                            {structuredDataValidationResults.data.validItems}
                          </div>
                        </div>
                        <div className="bg-card rounded p-3">
                          <div className="text-sm text-muted-foreground">Invalid Items</div>
                          <div className="text-2xl font-bold text-red-600">
                            {structuredDataValidationResults.data.invalidItems}
                          </div>
                        </div>
                      </div>

                      {structuredDataValidationResults.data.items &&
                        structuredDataValidationResults.data.items.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="font-semibold text-sm">Items Found:</h5>
                            {structuredDataValidationResults.data.items.map(
                              (item: any, idx: number) => (
                                <div key={idx} className="bg-card rounded p-3">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium">{item.type}</span>
                                    <div className="flex items-center gap-2">
                                      <Badge variant={item.isValid ? 'default' : 'destructive'}>
                                        Score: {item.score}/100
                                      </Badge>
                                      {item.isValid ? (
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                      ) : (
                                        <XCircle className="h-4 w-4 text-red-600" />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        )}

                      {structuredDataValidationResults.data.issues &&
                        structuredDataValidationResults.data.issues.length > 0 && (
                          <div className="mt-4 space-y-2">
                            <h5 className="font-semibold text-sm text-red-900">Issues:</h5>
                            {structuredDataValidationResults.data.issues.map(
                              (issue: Record<string, unknown>, idx: number) => (
                                <div key={idx} className="bg-red-100 rounded p-2 text-sm">
                                  <span className="font-semibold text-red-900">
                                    [{issue.severity}]
                                  </span>{' '}
                                  <span className="text-red-800">{issue.message}</span>
                                </div>
                              )
                            )}
                          </div>
                        )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-red-900 mb-1">Validation Failed</h4>
                        <p className="text-sm text-red-800">
                          {structuredDataValidationResults.error}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
