import { Button } from '@/components/ui/button';
import { BudgetCalculation } from '@/types/budgetCalculator';
import { formatCurrency } from '@/lib/budgetCalculator/calculator';
import { trackBudgetSocialShare } from '@/lib/budgetCalculator/supabaseIntegration';
import { Facebook, Twitter, Copy, Mail, Download } from 'lucide-react';
import { toast } from 'sonner';
import { downloadShareImage } from '@/lib/budgetCalculator/shareImageGenerator';

interface ShareButtonsProps {
  calculation: BudgetCalculation;
  familySize: number;
  calculationId?: string | null;
  name?: string;
}

export function ShareButtons({
  calculation,
  familySize,
  calculationId,
  name,
}: ShareButtonsProps) {
  const shareUrl = window.location.href;
  const shareText = `I calculated my family's grocery budget and I'm saving ${formatCurrency(
    calculation.annualSavings
  )} per year! Calculate yours at TryEatPal.com`;

  const trackShare = async (platform: 'facebook' | 'twitter' | 'email') => {
    if (calculationId) {
      try {
        await trackBudgetSocialShare(calculationId, platform);
      } catch (error) {
        console.error('Error tracking share:', error);
      }
    }
  };

  const handleFacebookShare = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
      shareUrl
    )}`;
    window.open(facebookUrl, '_blank', 'width=600,height=400');
    trackShare('facebook');
  };

  const handleTwitterShare = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      shareText
    )}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank', 'width=600,height=400');
    trackShare('twitter');
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent('Check out my Grocery Budget Results!');
    const body = encodeURIComponent(`${shareText}\n\n${shareUrl}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    trackShare('email');
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    toast.success('Link copied to clipboard!');
  };

  const handleDownloadImage = async () => {
    try {
      await downloadShareImage(calculation, familySize, name);
      toast.success('Share image downloaded!');
    } catch (error) {
      console.error('Error downloading share image:', error);
      toast.error('Failed to download image. Please try again.');
    }
  };

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button variant="outline" size="sm" onClick={handleDownloadImage} className="gap-2">
        <Download className="w-4 h-4" />
        Download Image
      </Button>

      <Button variant="outline" size="sm" onClick={handleFacebookShare} className="gap-2">
        <Facebook className="w-4 h-4" />
        Facebook
      </Button>

      <Button variant="outline" size="sm" onClick={handleTwitterShare} className="gap-2">
        <Twitter className="w-4 h-4" />
        Twitter
      </Button>

      <Button variant="outline" size="sm" onClick={handleEmailShare} className="gap-2">
        <Mail className="w-4 h-4" />
        Email
      </Button>

      <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-2">
        <Copy className="w-4 h-4" />
        Copy Link
      </Button>
    </div>
  );
}
