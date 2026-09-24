import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Share2,
  Mail,
  MessageSquare,
  Printer,
  Copy,
  Check,
  Smartphone,
  Download,
} from 'lucide-react';
import { Recipe, Food } from '@/types';
import { toast } from 'sonner';
import { logger } from "@/lib/logger";
import { escapeHtml } from "@/lib/sanitize";
import { buildRecipeShareText, recipeIngredientLines, shareRecipe } from "@/lib/recipeShareText";

interface RecipeExportActionsProps {
  recipe: Recipe;
  foods: Food[];
  trigger?: React.ReactNode;
  className?: string;
}

/**
 * RecipeExportActions Component
 * 
 * Provides multiple ways for users to export and share recipes:
 * - Send to Phone (Email/SMS)
 * - Print Shopping List
 * - Copy Ingredients
 * - Share Recipe (Native share sheet)
 * - Download as Text
 * 
 * Phase 1.2 Implementation from Integration Roadmap
 */
export function RecipeExportActions({ recipe, foods, trigger, className }: RecipeExportActionsProps) {
  const [copied, setCopied] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showSMSDialog, setShowSMSDialog] = useState(false);
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Recipe amounts (structured rows) or the linked foods by name. The old
  // version printed each food's PANTRY stock as if it were the recipe amount.
  const recipeIngredients = recipeIngredientLines(recipe, foods);

  // The recipe as plain text: ingredients, steps, tip, source.
  const generateShoppingList = () => buildRecipeShareText(recipe, foods);

  // Generate ingredients-only text
  const generateIngredientsText = () => {
    return [
      `${recipe.name} - Ingredients`,
      `Serves: ${recipe.servings || '4'}`,
      '',
      ...recipeIngredients,
    ].join('\n');
  };

  // Copy ingredients to clipboard
  const handleCopyIngredients = async () => {
    const text = generateIngredientsText();
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard!', {
        description: 'Paste ingredients into your shopping app',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      logger.error('Failed to copy:', error);
      toast.error('Failed to copy to clipboard');
    }
  };

  // Copy full shopping list
  const handleCopyShoppingList = async () => {
    const text = generateShoppingList();
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Shopping list copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      logger.error('Failed to copy:', error);
      toast.error('Failed to copy to clipboard');
    }
  };

  // Print through a hidden iframe instead of a popup: window.open with
  // noopener returns null, so there would be no window to write into.
  const handlePrint = () => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);
    const printWindow = frame.contentWindow;
    if (!printWindow) {
      frame.remove();
      toast.error('Could not open the print dialog');
      return;
    }

    const content = generateShoppingList();
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Shopping List - ${escapeHtml(recipe.name)}</title>
        <style>
          @media print {
            body { 
              font-family: Arial, sans-serif;
              padding: 20px;
              line-height: 1.6;
            }
            h1 { 
              color: #2563eb;
              border-bottom: 3px solid #2563eb;
              padding-bottom: 10px;
            }
            .ingredient {
              padding: 8px;
              border-bottom: 1px solid #e5e7eb;
            }
            .ingredient:hover {
              background: #f9fafb;
            }
            .instructions {
              margin-top: 20px;
              padding: 15px;
              background: #f3f4f6;
              border-radius: 8px;
            }
            .tip {
              margin-top: 20px;
              padding: 15px;
              background: #dbeafe;
              border-left: 4px solid #2563eb;
              border-radius: 4px;
            }
          }
        </style>
      </head>
      <body>
        <pre style="white-space: pre-wrap; font-family: Arial, sans-serif;">${escapeHtml(content)}</pre>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    setTimeout(() => frame.remove(), 1000);
    
    toast.success('Print dialog opened');
  };

  // Send via email
  const handleSendEmail = async () => {
    if (!email) {
      toast.error('Please enter an email address');
      return;
    }

    // In production, this would call a backend API
    // For now, we'll use mailto
    const subject = encodeURIComponent(`Recipe: ${recipe.name}`);
    const body = encodeURIComponent(generateShoppingList());
    const mailtoLink = `mailto:${email}?subject=${subject}&body=${body}`;
    
    window.location.href = mailtoLink;
    setShowEmailDialog(false);
    setEmail('');
    
    toast.success('Email client opened', {
      description: 'Sending recipe to ' + email,
    });
  };

  // Send via SMS
  const handleSendSMS = async () => {
    if (!phoneNumber) {
      toast.error('Please enter a phone number');
      return;
    }

    // Format phone number
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // Use SMS protocol (works on most mobile devices)
    const body = encodeURIComponent(
      `${recipe.name} - Ingredients:\n${recipeIngredients.join(', ')}`
    );
    
    const smsLink = `sms:${cleanNumber}?body=${body}`;
    window.location.href = smsLink;
    
    setShowSMSDialog(false);
    setPhoneNumber('');
    
    toast.success('SMS app opened');
  };

  // Native share sheet with the recipe as text; clipboard where there is none.
  const handleNativeShare = async () => {
    const outcome = await shareRecipe(recipe, foods);
    if (outcome === 'copied') toast.success('Recipe copied to clipboard');
    else if (outcome === 'failed') {
      logger.error('Error sharing recipe');
      toast.error('Failed to share recipe');
    }
  };

  // Download as text file
  const handleDownload = () => {
    const content = generateShoppingList();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recipe.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_shopping_list.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Shopping list downloaded!');
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger || (
            <Button variant="outline" size="sm" className={className}>
              <Share2 className="h-4 w-4 mr-2" />
              Export & Share
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={handleCopyIngredients}>
            {copied ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Copy Ingredients
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={handleCopyShoppingList}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Shopping List
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={() => setShowEmailDialog(true)}>
            <Mail className="h-4 w-4 mr-2" />
            Send to Email
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={() => setShowSMSDialog(true)}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Send to Phone (SMS)
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print Shopping List
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download as Text
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleNativeShare}>
            <Smartphone className="h-4 w-4 mr-2" />
            Share via...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Recipe to Email</DialogTitle>
            <DialogDescription>
              Send the shopping list and recipe to your email
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendEmail()}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSendEmail}>
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* SMS Dialog */}
      <Dialog open={showSMSDialog} onOpenChange={setShowSMSDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Recipe to Phone</DialogTitle>
            <DialogDescription>
              Send the ingredient list to your phone via SMS
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="(555) 123-4567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendSMS()}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowSMSDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSendSMS}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Send SMS
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


