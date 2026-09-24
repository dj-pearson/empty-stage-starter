import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from "@/lib/logger";
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parseGroceryText, type ParsedGroceryItem } from '@/lib/parse-grocery-text';
import type { GroceryAddInput } from '@/lib/groceryMerge';
import { useFoods, useKids } from '@/contexts/AppContext';
import { parseGroceryImagePayload, toGroceryAddInput } from '@/components/grocery/groceryInputSchemas';
import { ParsedItemsPreview } from '@/components/grocery/ParsedItemsPreview';
import { validateFile, compressImage, fileToBase64, FileSizeLimits, MimeTypeGroups } from '@/lib/file-utils';
import { supabase } from '@/integrations/supabase/client';
import { Image, Type, Upload, Loader2, ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';
import { PHOTO_AI_NOTICE } from '@/lib/aiSafety';

interface GroceryImportTabProps {
  /** Rows arrive tagged added_via 'import'. */
  onAddItems: (items: GroceryAddInput[]) => void;
}

export function GroceryImportTab({ onAddItems }: GroceryImportTabProps) {
  const { t } = useTranslation();
  const { foods } = useFoods();
  const { kids } = useKids();
  const [mode, setMode] = useState<'image' | 'text'>('text');
  const [text, setText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedGroceryItem[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleParseText = () => {
    if (!text.trim()) {
      toast.error(t('grocery.input.import.emptyText', 'Paste or type a grocery list first'));
      return;
    }
    const items = parseGroceryText(text);
    if (items.length === 0) {
      toast.error(t('grocery.input.import.noneInText', 'No grocery items could be read from the text'));
      return;
    }
    setParsedItems(items);
    toast.success(t('grocery.input.import.found', { defaultValue: 'Found {{count}} items', count: items.length }));
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

      // Model output: validate each row, keep the readable ones, say how many
      // were not.
      const { items, dropped } = parseGroceryImagePayload(data);

      if (items.length === 0) {
        toast.error(t('grocery.input.import.noneInImage', 'No grocery items found in the image. Try a clearer photo.'));
        return;
      }

      setParsedItems(items);
      toast.success(t('grocery.input.import.found', { defaultValue: 'Found {{count}} items', count: items.length }), {
        description:
          dropped > 0
            ? t('grocery.input.import.dropped', { defaultValue: '{{count}} lines could not be read', count: dropped })
            : undefined,
      });
    } catch (err) {
      logger.error('Image parse error:', err);
      toast.error(t('grocery.input.import.imageFailed', 'Failed to process image. Check your connection and try again.'));
    } finally {
      setIsProcessing(false);
    }
  }, [t]);

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
      onAddItems(items.map((item) => toGroceryAddInput(item, { added_via: 'import' })));
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
                <Type className="h-3.5 w-3.5" aria-hidden="true" />
                {t('grocery.input.import.pasteTab', 'Paste text')}
              </TabsTrigger>
              <TabsTrigger value="image" className="gap-1.5">
                <Image className="h-3.5 w-3.5" aria-hidden="true" />
                {t('grocery.input.import.imageTab', 'From image')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-3 mt-3">
              <div className="space-y-2">
                <Label htmlFor="grocery-text" className="text-sm">
                  {t('grocery.input.import.pasteLabel', 'Paste your grocery list')}
                </Label>
                <Textarea
                  id="grocery-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t(
                    'grocery.input.import.pastePlaceholder',
                    'Paste from Notes or Reminders, or type items:\n\n2 lbs chicken breast\n1 gallon milk\nBananas\n\nOr comma-separated: eggs, butter, rice',
                  )}
                  rows={7}
                  className="text-sm"
                />
              </div>
              <Button
                type="button"
                onClick={handleParseText}
                disabled={!text.trim()}
                className="w-full h-11"
              >
                <ClipboardPaste className="h-4 w-4 mr-2" aria-hidden="true" />
                {t('grocery.input.import.parse', 'Read list')}
              </Button>
            </TabsContent>

            <TabsContent value="image" className="space-y-3 mt-3">
              {/* US-632: the image goes to an AI provider; say so before it is sent. */}
              <p className="text-xs text-muted-foreground">{PHOTO_AI_NOTICE}</p>
              <Card
                className={`p-6 border-2 border-dashed transition-colors cursor-pointer ${
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
                role="button"
                tabIndex={isProcessing ? -1 : 0}
                aria-disabled={isProcessing}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (isProcessing || (e.key !== 'Enter' && e.key !== ' ')) return;
                  e.preventDefault();
                  fileInputRef.current?.click();
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <div>
                        <p className="font-medium text-sm">{t('grocery.input.import.processing', 'Reading the image...')}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('grocery.input.import.processingHint', 'Picking out the grocery items')}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">
                          {t('grocery.input.import.dropHint', 'Drop an image here, tap to browse, or paste one')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('grocery.input.import.dropSub', 'Screenshots, photos of handwritten lists, Notes exports')}
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
                aria-label={t('grocery.input.import.uploadLabel', 'Upload grocery list image')}
              />
            </TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground text-center">
            {t('grocery.input.import.pasteTip', 'Tip: you can paste an image anywhere on this tab')}
          </p>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">{t('grocery.input.import.parsedHeading', 'Items found')}</h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setParsedItems(null)}
              className="text-xs h-11 sm:h-9"
            >
              {t('grocery.input.import.startOver', 'Start over')}
            </Button>
          </div>
          <ParsedItemsPreview
            items={parsedItems}
            onAddSelected={handleAddSelected}
            isAdding={isAdding}
            foods={foods}
            kids={kids}
          />
        </div>
      )}
    </div>
  );
}
