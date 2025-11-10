import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Mail, Download, Gift } from 'lucide-react';
import { BudgetEmailCaptureData } from '@/types/budgetCalculator';
import { captureBudgetEmailLead } from '@/lib/budgetCalculator/supabaseIntegration';
import { toast } from 'sonner';

interface EmailCaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calculationId: string;
  monthlyBudget: number;
  familySize: number;
  onEmailCaptured: (email: string, name: string) => void;
  trigger?: 'download' | 'trial' | 'share';
}

export function EmailCaptureModal({
  open,
  onOpenChange,
  calculationId,
  monthlyBudget,
  familySize,
  onEmailCaptured,
  trigger = 'download',
}: EmailCaptureModalProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [acceptsMarketing, setAcceptsMarketing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsSubmitting(true);

    try {
      const emailData: BudgetEmailCaptureData = {
        email: email.trim(),
        name: name.trim(),
        acceptsMarketing,
      };

      await captureBudgetEmailLead(calculationId, emailData, monthlyBudget, familySize);

      toast.success('Email saved successfully!');
      onEmailCaptured(email, name);
      onOpenChange(false);
    } catch (err) {
      console.error('Error capturing email:', err);
      setError('Failed to save email. Please try again.');
      toast.error('Failed to save email');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTitle = () => {
    switch (trigger) {
      case 'download':
        return 'Download Your Full Budget Report';
      case 'trial':
        return 'Start Your Free Trial';
      case 'share':
        return 'Share Your Budget Results';
      default:
        return 'Get Your Full Budget Report';
    }
  };

  const getDescription = () => {
    switch (trigger) {
      case 'download':
        return 'Get your comprehensive budget report with personalized tips, meal ideas, and shopping strategies delivered to your inbox!';
      case 'trial':
        return 'Start your free trial of TryEatPal and turn your budget into reality with smart meal planning and grocery management.';
      case 'share':
        return 'Enter your email to unlock sharing features and get your budget report sent to your inbox.';
      default:
        return 'Enter your email to receive your personalized budget report and exclusive meal planning tips!';
    }
  };

  const getBenefits = () => {
    const commonBenefits = [
      'Full budget breakdown PDF',
      'Personalized meal planning tips',
      'Weekly grocery shopping strategies',
    ];

    if (trigger === 'trial') {
      return [
        '7-day free trial of TryEatPal Premium',
        'AI-powered meal plans that fit your budget',
        'Smart grocery lists and shopping tools',
        'Track savings and reduce waste',
      ];
    }

    return commonBenefits;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-green-100 rounded-full">
              {trigger === 'download' ? (
                <Download className="w-8 h-8 text-green-600" />
              ) : trigger === 'trial' ? (
                <Gift className="w-8 h-8 text-green-600" />
              ) : (
                <Mail className="w-8 h-8 text-green-600" />
              )}
            </div>
          </div>
          <DialogTitle className="text-center text-2xl">{getTitle()}</DialogTitle>
          <DialogDescription className="text-center">{getDescription()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Benefits list */}
          <div className="bg-green-50 p-4 rounded-lg space-y-2">
            <p className="font-semibold text-sm text-green-900">You'll get:</p>
            <ul className="space-y-1">
              {getBenefits().map((benefit, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-green-800">
                  <span className="text-green-600">✓</span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name *</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="marketing"
                checked={acceptsMarketing}
                onCheckedChange={(checked) => setAcceptsMarketing(checked as boolean)}
                disabled={isSubmitting}
              />
              <label htmlFor="marketing" className="text-sm text-gray-600 cursor-pointer">
                Send me money-saving tips, meal planning ideas, and exclusive offers from TryEatPal
              </label>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving...'
                : trigger === 'trial'
                  ? 'Start Free Trial'
                  : 'Get My Budget Report'}
            </Button>

            <p className="text-xs text-gray-500 text-center">
              Your information is safe with us. We respect your privacy and won't spam you.
            </p>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
