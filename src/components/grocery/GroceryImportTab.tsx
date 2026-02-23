import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FoodCategory } from '@/types';
import { parseGroceryText, type ParsedGroceryItem } from '@/lib/parse-grocery-text';
import { ParsedItemsPreview } from '@/components/grocery/ParsedItemsPreview';
import { validateFile, compressImage, fileToBase64, FileSizeLimits, MimeTypeGroups } from '@/lib/file-utils';
import { supabase } from '@/integrations/supabase/client';
import { Image, Type, Upload, Loader2, ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';

interface GroceryImportTabProps {
  onAddItems: (items: { name: string; quantity: number; unit: string; category: FoodCategory }[]) => void;
}

export function GroceryImportTab({ onAddItems }: GroceryImportTabProps) {
  const [mode, setMode] = useState<'image' | 'text'>('text');
  const [text, setText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedGroceryItem[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleParseText = () => {
    if (!text.trim()) {
      toast.error('Please paste or type a grocery list');
      return;
    }
    const items = parseGroceryText(text);
    if (items.length === 0) {
      toast.error('No grocery items could be parsed from the text');
      return;
    }
    setParsedItems(items);
    toast.success(`Found ${items.length} item${items.length !== 1 ? 's' : ''}`);
  };

  const processImage = useCallback(async (file: File) => {
    const validation = validateFile(file, {
      maxSize: FileSizeLimits.IMAGE_LARGE,
      allowedTypes: MimeTypeGroups.IMAGES,
    });

    if (!validation.valid) {
      toast.error(validation.errors[0]);
      return;
    }

    setIsProcessing(true);
    setParsedItems(null);

    try {
      // Compress before sending
      const compressed = await compressImage(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.85,
      });
      const compressedFile = new File([compressed], file.name, { type: compressed.type });
      const base64 = await fileToBase64(compressedFile);

      const { data, error } = await supabase.functions.invoke('parse-grocery-image', {
        body: { imageBase64: base64 },
      });

      if (error) throw error;

      const items: ParsedGroceryItem[] = (data?.items || []).map((item: any) => ({
        name: item.name,
        quantity: item.quantity || 1,
        unit: item.unit || '',
        category: item.category || 'snack',
      }));

      if (items.length === 0) {
        toast.error('No grocery items found in the image. Try a clearer photo.');
        return;
      }

      setParsedItems(items);
      toast.success(`Found ${items.length} item${items.length !== 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Image parse error:', err);
      toast.error('Failed to process image. Check your connection and try again.');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processImage(file);
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          setMode('image');
          processImage(file);
        }
        return;
      }
    }
  }, [processImage]);

  const handleAddSelected = async (items: ParsedGroceryItem[]) => {
    setIsAdding(true);
    try {
      onAddItems(items);
      setParsedItems(null);
      setText('');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-4" onPaste={handlePaste}>
      {!parsedItems ? (
        <>
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'image' | 'text')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text" className="gap-1.5">
                <Type className="h-3.5 w-3.5" />
                Paste Text
              </TabsTrigger>
              <TabsTrigger value="image" className="gap-1.5">
                <Image className="h-3.5 w-3.5" />
                From Image
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-3 mt-3">
              <div className="space-y-2">
                <Label htmlFor="grocery-text" className="text-sm">
                  Paste your grocery list
                </Label>
                <Textarea
                  id="grocery-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`Paste from Notes, Reminders, or type items:\n\n- 2 lbs chicken breast\n- 1 gallon milk\n- Bananas\n- 3 cans tomato sauce\n- Bread\n\nOr comma-separated: eggs, butter, cheese, rice`}
                  rows={7}
                  className="font-mono text-sm"
                />
              </div>
              <Button
                type="button"
                onClick={handleParseText}
                disabled={!text.trim()}
                className="w-full"
              >
                <ClipboardPaste className="h-4 w-4 mr-2" />
                Parse List
              </Button>
            </TabsContent>

            <TabsContent value="image" className="space-y-3 mt-3">
              <Card
                className={`p-6 border-2 border-dashed transition-colors cursor-pointer ${
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <div>
                        <p className="font-medium text-sm">Processing image...</p>
                        <p className="text-xs text-muted-foreground">AI is extracting grocery items</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">
                          Drop image here, click to browse, or paste from clipboard
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Supports screenshots, photos of handwritten lists, Notes app exports
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </Card>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                aria-label="Upload grocery list image"
              />
            </TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground text-center">
            Tip: You can paste an image from clipboard anywhere on this tab
          </p>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Parsed Items</h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setParsedItems(null)}
              className="text-xs"
            >
              Start Over
            </Button>
          </div>
          <ParsedItemsPreview
            items={parsedItems}
            onAddSelected={handleAddSelected}
            isAdding={isAdding}
          />
        </div>
      )}
    </div>
  );
}
