import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { PersonalityType } from '@/types/quiz';
import { getPersonalityName } from '@/lib/quiz/personalityTypes';
import { Download, Mail, Gift } from 'lucide-react';

interface EmailCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  personalityType: PersonalityType;
  onEmailCaptured: (email: string, childName: string, parentName: string) => void;
}

export function EmailCaptureModal({
  isOpen,
  onClose,
  personalityType,
  onEmailCaptured,
}: EmailCaptureModalProps) {
  const [email, setEmail] = useState('');
  const [childName, setChildName] = useState('');
  const [parentName, setParentName] = useState('');
  const [acceptsMarketing, setAcceptsMarketing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const personalityName = getPersonalityName(personalityType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Save to Supabase (will implement)
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulated delay

      onEmailCaptured(email, childName, parentName);
    } catch (error) {
      console.error('Error saving email:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Gift className="w-6 h-6 text-primary" />
            Get Your Complete Feeding Strategy Guide
          </DialogTitle>
          <DialogDescription className="text-base">
            Unlock your full personalized report for <strong>{personalityName}</strong> eaters
          </DialogDescription>
        </DialogHeader>

        <div className="bg-primary/5 dark:bg-primary/10 rounded-lg p-4 my-4">
          <h4 className="font-semibold mb-2">You'll get instant access to:</h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Download className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <span>Detailed 8-10 page PDF report</span>
            </li>
            <li className="flex items-start gap-2">
              <Mail className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <span>7-day personalized meal plan</span>
            </li>
            <li className="flex items-start gap-2">
              <Download className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <span>Recipe cards for "gateway foods"</span>
            </li>
            <li className="flex items-start gap-2">
              <Mail className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <span>Weekly recipes matched to your child's profile</span>
            </li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="childName">Child's Name *</Label>
            <Input
              id="childName"
              type="text"
              placeholder="Alex"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parentName">Your Name *</Label>
            <Input
              id="parentName"
              type="text"
              placeholder="Sam"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              required
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="marketing"
              checked={acceptsMarketing}
              onCheckedChange={(checked) => setAcceptsMarketing(checked as boolean)}
            />
            <Label htmlFor="marketing" className="text-sm cursor-pointer">
              Yes, send me weekly recipes matched to my child's profile
            </Label>
          </div>

          <p className="text-xs text-gray-600 dark:text-gray-400">
            We'll never share your email. Unsubscribe anytime.
          </p>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Sending...' : 'Get My Complete Guide'}
          </Button>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Join <strong>3,142 parents</strong> finally winning at mealtime
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
