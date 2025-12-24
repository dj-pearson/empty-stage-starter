import { useState, useCallback, useRef } from "react";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Type,
  Image,
  Link,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  List,
  Minus,
  Square,
  Plus,
  Trash2,
  Move,
  Eye,
  Save,
  Undo,
  Redo,
  Copy,
  Settings,
  Palette,
  Layout,
  Code,
  Send,
  ChevronUp,
  ChevronDown,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

// Email Block Types
type BlockType = "text" | "heading" | "image" | "button" | "divider" | "spacer" | "columns" | "html";

interface EmailBlock {
  id: string;
  type: BlockType;
  content: Record<string, any>;
  styles: Record<string, string>;
}

interface EmailTemplate {
  id?: string;
  name: string;
  subject: string;
  category: string;
  blocks: EmailBlock[];
  globalStyles: {
    backgroundColor: string;
    fontFamily: string;
    primaryColor: string;
    textColor: string;
  };
}

// Available blocks for drag-and-drop
const AVAILABLE_BLOCKS: { type: BlockType; label: string; icon: React.ReactNode }[] = [
  { type: "heading", label: "Heading", icon: <Type className="h-4 w-4" /> },
  { type: "text", label: "Text Block", icon: <AlignLeft className="h-4 w-4" /> },
  { type: "image", label: "Image", icon: <Image className="h-4 w-4" /> },
  { type: "button", label: "Button", icon: <Square className="h-4 w-4" /> },
  { type: "divider", label: "Divider", icon: <Minus className="h-4 w-4" /> },
  { type: "spacer", label: "Spacer", icon: <Layout className="h-4 w-4" /> },
  { type: "columns", label: "2 Columns", icon: <Layout className="h-4 w-4" /> },
  { type: "html", label: "Custom HTML", icon: <Code className="h-4 w-4" /> },
];

// Default block content
const getDefaultBlockContent = (type: BlockType): EmailBlock => {
  const id = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  switch (type) {
    case "heading":
      return {
        id,
        type,
        content: { text: "Heading Text", level: "h2" },
        styles: { textAlign: "center", color: "#333333", fontSize: "24px" },
      };
    case "text":
      return {
        id,
        type,
        content: { text: "Enter your text here. You can add paragraphs, bold text, and more." },
        styles: { textAlign: "left", color: "#666666", fontSize: "16px", lineHeight: "1.6" },
      };
    case "image":
      return {
        id,
        type,
        content: { src: "", alt: "Image description", link: "" },
        styles: { width: "100%", maxWidth: "600px", textAlign: "center" },
      };
    case "button":
      return {
        id,
        type,
        content: { text: "Click Here", link: "#" },
        styles: {
          backgroundColor: "#4F46E5",
          color: "#ffffff",
          padding: "12px 24px",
          borderRadius: "6px",
          textAlign: "center",
          fontSize: "16px",
        },
      };
    case "divider":
      return {
        id,
        type,
        content: {},
        styles: { borderColor: "#e5e7eb", borderWidth: "1px", margin: "20px 0" },
      };
    case "spacer":
      return {
        id,
        type,
        content: {},
        styles: { height: "20px" },
      };
    case "columns":
      return {
        id,
        type,
        content: {
          left: { text: "Left column content" },
          right: { text: "Right column content" },
        },
        styles: { gap: "20px" },
      };
    case "html":
      return {
        id,
        type,
        content: { html: "<p>Custom HTML content</p>" },
        styles: {},
      };
    default:
      return { id, type, content: {}, styles: {} };
  }
};

export function EmailTemplateBuilder() {
  const [template, setTemplate] = useState<EmailTemplate>({
    name: "",
    subject: "",
    category: "general",
    blocks: [],
    globalStyles: {
      backgroundColor: "#f9fafb",
      fontFamily: "Arial, sans-serif",
      primaryColor: "#4F46E5",
      textColor: "#333333",
    },
  });

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showCodeView, setShowCodeView] = useState(false);
  const [history, setHistory] = useState<EmailTemplate[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draggedBlockType, setDraggedBlockType] = useState<BlockType | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Save to history for undo/redo
  const saveToHistory = useCallback((newTemplate: EmailTemplate) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newTemplate)));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setTemplate(JSON.parse(JSON.stringify(history[historyIndex - 1])));
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setTemplate(JSON.parse(JSON.stringify(history[historyIndex + 1])));
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, blockType: BlockType) => {
    setDraggedBlockType(blockType);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedBlockType) {
      const newBlock = getDefaultBlockContent(draggedBlockType);
      const newBlocks = [...template.blocks];
      newBlocks.splice(index, 0, newBlock);
      const newTemplate = { ...template, blocks: newBlocks };
      setTemplate(newTemplate);
      saveToHistory(newTemplate);
      setSelectedBlockId(newBlock.id);
    }
    setDraggedBlockType(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedBlockType(null);
    setDragOverIndex(null);
  };

  // Block manipulation
  const addBlock = (type: BlockType) => {
    const newBlock = getDefaultBlockContent(type);
    const newTemplate = { ...template, blocks: [...template.blocks, newBlock] };
    setTemplate(newTemplate);
    saveToHistory(newTemplate);
    setSelectedBlockId(newBlock.id);
  };

  const updateBlock = (blockId: string, updates: Partial<EmailBlock>) => {
    const newBlocks = template.blocks.map((block) =>
      block.id === blockId ? { ...block, ...updates } : block
    );
    const newTemplate = { ...template, blocks: newBlocks };
    setTemplate(newTemplate);
  };

  const deleteBlock = (blockId: string) => {
    const newBlocks = template.blocks.filter((block) => block.id !== blockId);
    const newTemplate = { ...template, blocks: newBlocks };
    setTemplate(newTemplate);
    saveToHistory(newTemplate);
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
  };

  const moveBlock = (blockId: string, direction: "up" | "down") => {
    const index = template.blocks.findIndex((b) => b.id === blockId);
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === template.blocks.length - 1)
    ) {
      return;
    }

    const newBlocks = [...template.blocks];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    [newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]];

    const newTemplate = { ...template, blocks: newBlocks };
    setTemplate(newTemplate);
    saveToHistory(newTemplate);
  };

  const duplicateBlock = (blockId: string) => {
    const index = template.blocks.findIndex((b) => b.id === blockId);
    if (index === -1) return;

    const block = template.blocks[index];
    const newBlock = {
      ...JSON.parse(JSON.stringify(block)),
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    const newBlocks = [...template.blocks];
    newBlocks.splice(index + 1, 0, newBlock);

    const newTemplate = { ...template, blocks: newBlocks };
    setTemplate(newTemplate);
    saveToHistory(newTemplate);
    setSelectedBlockId(newBlock.id);
  };

  // Generate HTML
  const generateHTML = (): string => {
    const { globalStyles, blocks } = template;

    const blockToHTML = (block: EmailBlock): string => {
      switch (block.type) {
        case "heading":
          return `<${block.content.level} style="text-align: ${block.styles.textAlign}; color: ${block.styles.color}; font-size: ${block.styles.fontSize}; margin: 0 0 16px 0;">${block.content.text}</${block.content.level}>`;
        case "text":
          return `<p style="text-align: ${block.styles.textAlign}; color: ${block.styles.color}; font-size: ${block.styles.fontSize}; line-height: ${block.styles.lineHeight}; margin: 0 0 16px 0;">${block.content.text}</p>`;
        case "image":
          const imgContent = block.content.link
            ? `<a href="${block.content.link}"><img src="${block.content.src}" alt="${block.content.alt}" style="max-width: 100%; height: auto;" /></a>`
            : `<img src="${block.content.src}" alt="${block.content.alt}" style="max-width: 100%; height: auto;" />`;
          return `<div style="text-align: ${block.styles.textAlign};">${imgContent}</div>`;
        case "button":
          return `<div style="text-align: ${block.styles.textAlign}; padding: 16px 0;"><a href="${block.content.link}" style="display: inline-block; background-color: ${block.styles.backgroundColor}; color: ${block.styles.color}; padding: ${block.styles.padding}; border-radius: ${block.styles.borderRadius}; text-decoration: none; font-size: ${block.styles.fontSize};">${block.content.text}</a></div>`;
        case "divider":
          return `<hr style="border: none; border-top: ${block.styles.borderWidth} solid ${block.styles.borderColor}; margin: ${block.styles.margin};" />`;
        case "spacer":
          return `<div style="height: ${block.styles.height};"></div>`;
        case "columns":
          return `<table style="width: 100%; border-collapse: collapse;"><tr><td style="width: 50%; vertical-align: top; padding-right: ${block.styles.gap};">${block.content.left?.text || ""}</td><td style="width: 50%; vertical-align: top;">${block.content.right?.text || ""}</td></tr></table>`;
        case "html":
          return block.content.html || "";
        default:
          return "";
      }
    };

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${template.subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${globalStyles.backgroundColor}; font-family: ${globalStyles.fontFamily};">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 32px;">
              ${blocks.map(blockToHTML).join("\n              ")}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  };

  // Save template
  const handleSaveTemplate = async () => {
    if (!template.name.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    try {
      const htmlContent = generateHTML();

      const { data, error } = await supabase
        .from("automation_email_templates")
        .insert({
          template_name: template.name,
          template_key: template.name.toLowerCase().replace(/\s+/g, "_"),
          subject: template.subject,
          html_body: htmlContent,
          text_body: template.blocks
            .filter((b) => b.type === "text" || b.type === "heading")
            .map((b) => b.content.text)
            .join("\n\n"),
          category: template.category,
          variables: {},
        })
        .select("id")
        .single();

      if (error) throw error;

      toast.success("Template saved successfully");
      setShowSaveDialog(false);
    } catch (error) {
      logger.error("Error saving template:", error);
      toast.error("Failed to save template");
    }
  };

  // Render block in canvas
  const renderBlock = (block: EmailBlock) => {
    const isSelected = selectedBlockId === block.id;

    const blockContent = () => {
      switch (block.type) {
        case "heading":
          const HeadingTag = block.content.level as keyof JSX.IntrinsicElements;
          return (
            <HeadingTag
              style={{
                textAlign: block.styles.textAlign as any,
                color: block.styles.color,
                fontSize: block.styles.fontSize,
                margin: 0,
              }}
            >
              {block.content.text}
            </HeadingTag>
          );
        case "text":
          return (
            <p
              style={{
                textAlign: block.styles.textAlign as any,
                color: block.styles.color,
                fontSize: block.styles.fontSize,
                lineHeight: block.styles.lineHeight,
                margin: 0,
              }}
            >
              {block.content.text}
            </p>
          );
        case "image":
          return (
            <div style={{ textAlign: block.styles.textAlign as any }}>
              {block.content.src ? (
                <img
                  src={block.content.src}
                  alt={block.content.alt}
                  style={{ maxWidth: "100%", height: "auto" }}
                />
              ) : (
                <div className="bg-muted flex items-center justify-center h-32 rounded">
                  <Image className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>
          );
        case "button":
          return (
            <div style={{ textAlign: block.styles.textAlign as any, padding: "8px 0" }}>
              <span
                style={{
                  display: "inline-block",
                  backgroundColor: block.styles.backgroundColor,
                  color: block.styles.color,
                  padding: block.styles.padding,
                  borderRadius: block.styles.borderRadius,
                  fontSize: block.styles.fontSize,
                }}
              >
                {block.content.text}
              </span>
            </div>
          );
        case "divider":
          return (
            <hr
              style={{
                border: "none",
                borderTop: `${block.styles.borderWidth} solid ${block.styles.borderColor}`,
                margin: block.styles.margin,
              }}
            />
          );
        case "spacer":
          return <div style={{ height: block.styles.height }} />;
        case "columns":
          return (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-2 border rounded">{block.content.left?.text}</div>
              <div className="p-2 border rounded">{block.content.right?.text}</div>
            </div>
          );
        case "html":
          // Sanitize HTML to prevent XSS attacks
          const sanitizedHtml = DOMPurify.sanitize(block.content.html || "", {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'code', 'pre', 'div', 'span', 'table', 'tr', 'td', 'th', 'thead', 'tbody'],
            ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style', 'target', 'rel'],
            ALLOW_DATA_ATTR: false,
          });
          return (
            <div
              className="bg-muted/50 p-2 rounded text-sm font-mono"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          );
        default:
          return null;
      }
    };

    return (
      <div
        key={block.id}
        className={cn(
          "relative group cursor-pointer rounded-lg border-2 transition-all",
          isSelected ? "border-primary ring-2 ring-primary/20" : "border-transparent hover:border-muted"
        )}
        onClick={() => setSelectedBlockId(block.id)}
      >
        {/* Block toolbar */}
        <div
          className={cn(
            "absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background border rounded-md shadow-sm transition-opacity",
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              moveBlock(block.id, "up");
            }}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              moveBlock(block.id, "down");
            }}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              duplicateBlock(block.id);
            }}
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              deleteBlock(block.id);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>

        <div className="p-4">{blockContent()}</div>
      </div>
    );
  };

  // Selected block editor
  const selectedBlock = template.blocks.find((b) => b.id === selectedBlockId);

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">Email Template Builder</h2>
          <Badge variant="outline">{template.blocks.length} blocks</Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={undo}
            disabled={historyIndex <= 0}
          >
            <Undo className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
          >
            <Redo className="h-4 w-4" />
          </Button>

          <Separator orientation="vertical" className="h-6 mx-2" />

          <Button variant="outline" size="sm" onClick={() => setShowCodeView(true)}>
            <Code className="h-4 w-4 mr-2" />
            View Code
          </Button>

          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>

          <Button size="sm" onClick={() => setShowSaveDialog(true)}>
            <Save className="h-4 w-4 mr-2" />
            Save Template
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Block Library */}
        <div className="w-64 border-r bg-muted/30 p-4 overflow-auto">
          <h3 className="font-semibold mb-4">Add Blocks</h3>
          <div className="space-y-2">
            {AVAILABLE_BLOCKS.map((block) => (
              <div
                key={block.type}
                draggable
                onDragStart={(e) => handleDragStart(e, block.type)}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-3 p-3 bg-background border rounded-lg cursor-grab hover:border-primary hover:shadow-sm transition-all"
              >
                <div className="p-2 bg-muted rounded">
                  {block.icon}
                </div>
                <span className="text-sm font-medium">{block.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 bg-muted/20 overflow-auto p-8"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, template.blocks.length)}
        >
          <div
            className="max-w-[600px] mx-auto bg-white rounded-lg shadow-lg"
            style={{ backgroundColor: template.globalStyles.backgroundColor }}
          >
            <div className="p-8 bg-white rounded-lg m-4">
              {template.blocks.length === 0 ? (
                <div
                  className={cn(
                    "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
                    draggedBlockType ? "border-primary bg-primary/5" : "border-muted"
                  )}
                >
                  <Layout className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Drag blocks here or click to add
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 mt-4">
                    {AVAILABLE_BLOCKS.slice(0, 4).map((block) => (
                      <Button
                        key={block.type}
                        variant="outline"
                        size="sm"
                        onClick={() => addBlock(block.type)}
                      >
                        {block.icon}
                        <span className="ml-2">{block.label}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {template.blocks.map((block, index) => (
                    <div
                      key={block.id}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                    >
                      {dragOverIndex === index && (
                        <div className="h-1 bg-primary rounded-full my-2" />
                      )}
                      {renderBlock(block)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Block Settings */}
        <div className="w-80 border-l bg-background overflow-auto">
          <Tabs defaultValue="block" className="h-full">
            <TabsList className="w-full justify-start rounded-none border-b">
              <TabsTrigger value="block">Block</TabsTrigger>
              <TabsTrigger value="style">Style</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[calc(100%-48px)]">
              <TabsContent value="block" className="p-4 m-0">
                {selectedBlock ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="capitalize">
                        {selectedBlock.type}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteBlock(selectedBlock.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    {selectedBlock.type === "heading" && (
                      <>
                        <div>
                          <Label>Text</Label>
                          <Input
                            value={selectedBlock.content.text}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, {
                                content: { ...selectedBlock.content, text: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>Level</Label>
                          <Select
                            value={selectedBlock.content.level}
                            onValueChange={(value) =>
                              updateBlock(selectedBlock.id, {
                                content: { ...selectedBlock.content, level: value },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="h1">Heading 1</SelectItem>
                              <SelectItem value="h2">Heading 2</SelectItem>
                              <SelectItem value="h3">Heading 3</SelectItem>
                              <SelectItem value="h4">Heading 4</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {selectedBlock.type === "text" && (
                      <div>
                        <Label>Content</Label>
                        <Textarea
                          value={selectedBlock.content.text}
                          onChange={(e) =>
                            updateBlock(selectedBlock.id, {
                              content: { ...selectedBlock.content, text: e.target.value },
                            })
                          }
                          rows={6}
                        />
                      </div>
                    )}

                    {selectedBlock.type === "image" && (
                      <>
                        <div>
                          <Label>Image URL</Label>
                          <Input
                            value={selectedBlock.content.src}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, {
                                content: { ...selectedBlock.content, src: e.target.value },
                              })
                            }
                            placeholder="https://..."
                          />
                        </div>
                        <div>
                          <Label>Alt Text</Label>
                          <Input
                            value={selectedBlock.content.alt}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, {
                                content: { ...selectedBlock.content, alt: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>Link (optional)</Label>
                          <Input
                            value={selectedBlock.content.link}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, {
                                content: { ...selectedBlock.content, link: e.target.value },
                              })
                            }
                            placeholder="https://..."
                          />
                        </div>
                      </>
                    )}

                    {selectedBlock.type === "button" && (
                      <>
                        <div>
                          <Label>Button Text</Label>
                          <Input
                            value={selectedBlock.content.text}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, {
                                content: { ...selectedBlock.content, text: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>Link URL</Label>
                          <Input
                            value={selectedBlock.content.link}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, {
                                content: { ...selectedBlock.content, link: e.target.value },
                              })
                            }
                            placeholder="https://..."
                          />
                        </div>
                      </>
                    )}

                    {selectedBlock.type === "html" && (
                      <div>
                        <Label>Custom HTML</Label>
                        <Textarea
                          value={selectedBlock.content.html}
                          onChange={(e) =>
                            updateBlock(selectedBlock.id, {
                              content: { ...selectedBlock.content, html: e.target.value },
                            })
                          }
                          rows={10}
                          className="font-mono text-sm"
                        />
                      </div>
                    )}

                    {selectedBlock.type === "spacer" && (
                      <div>
                        <Label>Height (px)</Label>
                        <Input
                          type="number"
                          value={parseInt(selectedBlock.styles.height)}
                          onChange={(e) =>
                            updateBlock(selectedBlock.id, {
                              styles: { ...selectedBlock.styles, height: `${e.target.value}px` },
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Select a block to edit</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="style" className="p-4 m-0">
                {selectedBlock && (
                  <div className="space-y-4">
                    <div>
                      <Label>Text Align</Label>
                      <div className="flex gap-2 mt-2">
                        {["left", "center", "right"].map((align) => (
                          <Button
                            key={align}
                            variant={selectedBlock.styles.textAlign === align ? "default" : "outline"}
                            size="sm"
                            onClick={() =>
                              updateBlock(selectedBlock.id, {
                                styles: { ...selectedBlock.styles, textAlign: align },
                              })
                            }
                          >
                            {align === "left" && <AlignLeft className="h-4 w-4" />}
                            {align === "center" && <AlignCenter className="h-4 w-4" />}
                            {align === "right" && <AlignRight className="h-4 w-4" />}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {selectedBlock.type !== "divider" && selectedBlock.type !== "spacer" && (
                      <>
                        <div>
                          <Label>Text Color</Label>
                          <div className="flex gap-2 mt-2">
                            <Input
                              type="color"
                              value={selectedBlock.styles.color || "#333333"}
                              onChange={(e) =>
                                updateBlock(selectedBlock.id, {
                                  styles: { ...selectedBlock.styles, color: e.target.value },
                                })
                              }
                              className="w-12 h-10 p-1"
                            />
                            <Input
                              value={selectedBlock.styles.color || "#333333"}
                              onChange={(e) =>
                                updateBlock(selectedBlock.id, {
                                  styles: { ...selectedBlock.styles, color: e.target.value },
                                })
                              }
                            />
                          </div>
                        </div>

                        <div>
                          <Label>Font Size</Label>
                          <Input
                            value={selectedBlock.styles.fontSize || "16px"}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, {
                                styles: { ...selectedBlock.styles, fontSize: e.target.value },
                              })
                            }
                          />
                        </div>
                      </>
                    )}

                    {selectedBlock.type === "button" && (
                      <div>
                        <Label>Button Color</Label>
                        <div className="flex gap-2 mt-2">
                          <Input
                            type="color"
                            value={selectedBlock.styles.backgroundColor || "#4F46E5"}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, {
                                styles: { ...selectedBlock.styles, backgroundColor: e.target.value },
                              })
                            }
                            className="w-12 h-10 p-1"
                          />
                          <Input
                            value={selectedBlock.styles.backgroundColor || "#4F46E5"}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, {
                                styles: { ...selectedBlock.styles, backgroundColor: e.target.value },
                              })
                            }
                          />
                        </div>
                      </div>
                    )}

                    {selectedBlock.type === "divider" && (
                      <div>
                        <Label>Border Color</Label>
                        <div className="flex gap-2 mt-2">
                          <Input
                            type="color"
                            value={selectedBlock.styles.borderColor || "#e5e7eb"}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, {
                                styles: { ...selectedBlock.styles, borderColor: e.target.value },
                              })
                            }
                            className="w-12 h-10 p-1"
                          />
                          <Input
                            value={selectedBlock.styles.borderColor || "#e5e7eb"}
                            onChange={(e) =>
                              updateBlock(selectedBlock.id, {
                                styles: { ...selectedBlock.styles, borderColor: e.target.value },
                              })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="settings" className="p-4 m-0">
                <div className="space-y-4">
                  <div>
                    <Label>Background Color</Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        type="color"
                        value={template.globalStyles.backgroundColor}
                        onChange={(e) =>
                          setTemplate({
                            ...template,
                            globalStyles: {
                              ...template.globalStyles,
                              backgroundColor: e.target.value,
                            },
                          })
                        }
                        className="w-12 h-10 p-1"
                      />
                      <Input
                        value={template.globalStyles.backgroundColor}
                        onChange={(e) =>
                          setTemplate({
                            ...template,
                            globalStyles: {
                              ...template.globalStyles,
                              backgroundColor: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Primary Color</Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        type="color"
                        value={template.globalStyles.primaryColor}
                        onChange={(e) =>
                          setTemplate({
                            ...template,
                            globalStyles: {
                              ...template.globalStyles,
                              primaryColor: e.target.value,
                            },
                          })
                        }
                        className="w-12 h-10 p-1"
                      />
                      <Input
                        value={template.globalStyles.primaryColor}
                        onChange={(e) =>
                          setTemplate({
                            ...template,
                            globalStyles: {
                              ...template.globalStyles,
                              primaryColor: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Font Family</Label>
                    <Select
                      value={template.globalStyles.fontFamily}
                      onValueChange={(value) =>
                        setTemplate({
                          ...template,
                          globalStyles: { ...template.globalStyles, fontFamily: value },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                        <SelectItem value="Helvetica, sans-serif">Helvetica</SelectItem>
                        <SelectItem value="Georgia, serif">Georgia</SelectItem>
                        <SelectItem value="Times New Roman, serif">Times New Roman</SelectItem>
                        <SelectItem value="Verdana, sans-serif">Verdana</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Preview how your email will appear to recipients
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted rounded-lg p-4">
            <iframe
              srcDoc={generateHTML()}
              className="w-full h-full min-h-[400px] bg-white rounded-lg shadow"
              title="Email Preview"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Code View Dialog */}
      <Dialog open={showCodeView} onOpenChange={setShowCodeView}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>HTML Code</DialogTitle>
            <DialogDescription>
              Copy this code for use in your email campaigns
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <Textarea
              value={generateHTML()}
              readOnly
              className="font-mono text-sm h-full min-h-[400px]"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(generateHTML());
                toast.success("HTML copied to clipboard");
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy HTML
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Template</DialogTitle>
            <DialogDescription>
              Save this email template for future use
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                value={template.name}
                onChange={(e) => setTemplate({ ...template, name: e.target.value })}
                placeholder="e.g., Welcome Email"
              />
            </div>

            <div>
              <Label>Subject Line</Label>
              <Input
                value={template.subject}
                onChange={(e) => setTemplate({ ...template, subject: e.target.value })}
                placeholder="e.g., Welcome to EatPal!"
              />
            </div>

            <div>
              <Label>Category</Label>
              <Select
                value={template.category}
                onValueChange={(value) => setTemplate({ ...template, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="welcome">Welcome</SelectItem>
                  <SelectItem value="transactional">Transactional</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="notification">Notification</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate}>
              <Save className="h-4 w-4 mr-2" />
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
