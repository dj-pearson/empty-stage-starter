import { Button } from "@/components/ui/button";
import { Share2, Facebook, Twitter, Mail, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface SocialShareProps {
  title: string;
  text: string;
  url?: string;
}

export function SocialShare({ title, text, url = window.location.href }: SocialShareProps) {
  const [copied, setCopied] = useState(false);

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        toast.success("Shared successfully!");
      } catch (error) {
        console.error('Share failed:', error);
      }
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  const shareUrls = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + ' ' + url)}`,
  };

  // Show native share if available
  if (navigator.share) {
    return (
      <Button onClick={handleNativeShare} variant="outline">
        <Share2 className="h-4 w-4 mr-2" />
        Share
      </Button>
    );
  }

  // Fallback to social links
  return (
    <div className="flex gap-2">
      <Button onClick={handleCopyLink} variant="outline" size="sm">
        {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
        {copied ? 'Copied' : 'Copy Link'}
      </Button>
      <Button onClick={() => window.open(shareUrls.facebook)} variant="outline" size="icon">
        <Facebook className="h-4 w-4" />
      </Button>
      <Button onClick={() => window.open(shareUrls.twitter)} variant="outline" size="icon">
        <Twitter className="h-4 w-4" />
      </Button>
      <Button onClick={() => window.location.href = shareUrls.email} variant="outline" size="icon">
        <Mail className="h-4 w-4" />
      </Button>
    </div>
  );
}
