import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Share2, Copy, Check } from "lucide-react";
import { useState } from "react";

interface SocialShareButtonsProps {
  title: string;
  description?: string;
  url: string;
  imageUrl?: string;
}

export function SocialShareButtons({ title, description, url, imageUrl }: SocialShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedDesc = encodeURIComponent(description || "");

  const shareLinks = [
    {
      name: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      color: "hover:text-blue-600",
    },
    {
      name: "X",
      href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
      color: "hover:text-gray-900 dark:hover:text-gray-100",
    },
    {
      name: "Pinterest",
      href: `https://pinterest.com/pin/create/button/?url=${encodedUrl}&media=${encodeURIComponent(imageUrl || "")}&description=${encodedDesc}`,
      color: "hover:text-red-600",
    },
  ];

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: description, url });
      } catch {
        // User cancelled
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      {navigator.share && (
        <Button variant="outline" size="sm" onClick={handleNativeShare}>
          <Share2 className="h-4 w-4 mr-1" />
          Share
        </Button>
      )}
      {shareLinks.map((link) => (
        <Button
          key={link.name}
          variant="ghost"
          size="sm"
          className={link.color}
          onClick={() => {
            window.open(link.href, "_blank", "width=600,height=400");
          }}
        >
          {link.name}
        </Button>
      ))}
      <Button variant="ghost" size="sm" onClick={handleCopyLink}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}
