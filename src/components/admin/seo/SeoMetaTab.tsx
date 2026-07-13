import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';

/**
 * The Meta Tags configuration tab, extracted from the 5.6k-line SEOManager
 * (US-553 AC1). Purely presentational — state stays in the parent and is passed
 * down as props, so behavior is unchanged.
 */
export interface MetaTags {
  title: string;
  description: string;
  keywords: string;
  og_title: string;
  og_description: string;
  og_image: string;
  twitter_card: string;
  twitter_site: string;
}

export interface SeoMetaTabProps {
  metaTags: MetaTags;
  setMetaTags: (value: MetaTags) => void;
  onSave: () => void;
}

export function SeoMetaTab({ metaTags, setMetaTags, onSave }: SeoMetaTabProps) {
  return (
    <TabsContent value="meta">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Meta Tags Configuration
          </CardTitle>
          <CardDescription>Configure meta tags for SEO and social media sharing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Title Tag *</Label>
              <Input
                value={metaTags.title}
                onChange={(e) => setMetaTags({ ...metaTags, title: e.target.value })}
                placeholder="30-60 characters"
              />
              <p className="text-xs text-muted-foreground">
                Length: {metaTags.title.length} characters
              </p>
            </div>

            <div className="space-y-2">
              <Label>Keywords</Label>
              <Input
                value={metaTags.keywords}
                onChange={(e) => setMetaTags({ ...metaTags, keywords: e.target.value })}
                placeholder="comma, separated, keywords"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Meta Description *</Label>
            <Textarea
              value={metaTags.description}
              onChange={(e) => setMetaTags({ ...metaTags, description: e.target.value })}
              placeholder="120-160 characters"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Length: {metaTags.description.length} characters
            </p>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-4">Open Graph Tags (Facebook, LinkedIn)</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>OG Title</Label>
                <Input
                  value={metaTags.og_title}
                  onChange={(e) => setMetaTags({ ...metaTags, og_title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>OG Description</Label>
                <Textarea
                  value={metaTags.og_description}
                  onChange={(e) => setMetaTags({ ...metaTags, og_description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>OG Image URL</Label>
                <Input
                  value={metaTags.og_image}
                  onChange={(e) => setMetaTags({ ...metaTags, og_image: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-4">Twitter Card Tags</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Twitter Card Type</Label>
                <Input
                  value={metaTags.twitter_card}
                  onChange={(e) => setMetaTags({ ...metaTags, twitter_card: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Twitter Site Handle</Label>
                <Input
                  value={metaTags.twitter_site}
                  onChange={(e) => setMetaTags({ ...metaTags, twitter_site: e.target.value })}
                  placeholder="@username"
                />
              </div>
            </div>
          </div>

          <Button onClick={onSave} className="w-full">
            Save Meta Tags Configuration
          </Button>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
