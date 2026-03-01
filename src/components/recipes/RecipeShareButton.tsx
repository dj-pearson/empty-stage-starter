import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Share2, Facebook, Link, Check } from "lucide-react";
import { toast } from "sonner";
import { analytics } from "@/lib/analytics";
import type { Recipe } from "@/types";

interface RecipeShareButtonProps {
  recipe: Recipe;
}

export function RecipeShareButton({ recipe }: RecipeShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/recipes/${recipe.id}`;
  const shareTitle = recipe.name;
  const shareText = recipe.description || `Check out this recipe: ${recipe.name}`;

  const trackShare = (platform: string) => {
    analytics.trackEvent("recipe_shared", {
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      platform,
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard");
      trackShare("copy_link");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const shareToFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      "_blank",
      "width=600,height=400"
    );
    trackShare("facebook");
  };

  const shareToTwitter = () => {
    window.open(
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
      "_blank",
      "width=600,height=400"
    );
    trackShare("twitter");
  };

  const shareToPinterest = () => {
    const imageUrl = recipe.image_url || "";
    window.open(
      `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&media=${encodeURIComponent(imageUrl)}&description=${encodeURIComponent(shareText)}`,
      "_blank",
      "width=600,height=400"
    );
    trackShare("pinterest");
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        trackShare("native");
      } catch { /* user cancelled */ }
    }
  };

  // Use native share on mobile if available
  if (navigator.share) {
    return (
      <Button variant="outline" size="sm" onClick={nativeShare}>
        <Share2 className="h-4 w-4 mr-1" />
        Share
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="h-4 w-4 mr-1" />
          Share
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={shareToFacebook}>
          <Facebook className="h-4 w-4 mr-2" />
          Facebook
        </DropdownMenuItem>
        <DropdownMenuItem onClick={shareToTwitter}>
          <span className="h-4 w-4 mr-2 font-bold text-sm">𝕏</span>
          Twitter / X
        </DropdownMenuItem>
        <DropdownMenuItem onClick={shareToPinterest}>
          <span className="h-4 w-4 mr-2 text-sm">📌</span>
          Pinterest
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyLink}>
          {copied ? <Check className="h-4 w-4 mr-2" /> : <Link className="h-4 w-4 mr-2" />}
          {copied ? "Copied!" : "Copy Link"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
