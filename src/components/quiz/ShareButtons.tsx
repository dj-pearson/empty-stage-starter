import { Button } from '@/components/ui/button';
import { PersonalityType } from '@/types/quiz';
import { getPersonalityName } from '@/lib/quiz/personalityTypes';
import { Facebook, Twitter, Copy, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface ShareButtonsProps {
  personalityType: PersonalityType;
}

export function ShareButtons({ personalityType }: ShareButtonsProps) {
  const personalityName = getPersonalityName(personalityType);
  const shareUrl = window.location.href;
  const shareText = `I just discovered my child is ${personalityName}! Take this free picky eater quiz to understand your child's food personality.`;

  const handleFacebookShare = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    window.open(facebookUrl, '_blank', 'width=600,height=400');

    // Track analytics
    console.log('Shared on Facebook');
  };

  const handleTwitterShare = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank', 'width=600,height=400');

    // Track analytics
    console.log('Shared on Twitter');
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent('Check out this Picky Eater Quiz!');
    const body = encodeURIComponent(`${shareText}\n\n${shareUrl}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;

    // Track analytics
    console.log('Shared via Email');
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    toast.success('Link copied to clipboard!');

    // Track analytics
    console.log('Link copied');
  };

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleFacebookShare}
        className="gap-2"
      >
        <Facebook className="w-4 h-4" />
        Facebook
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleTwitterShare}
        className="gap-2"
      >
        <Twitter className="w-4 h-4" />
        Twitter
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleEmailShare}
        className="gap-2"
      >
        <Mail className="w-4 h-4" />
        Email
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleCopyLink}
        className="gap-2"
      >
        <Copy className="w-4 h-4" />
        Copy Link
      </Button>
    </div>
  );
}
