import { supabase } from '@/integrations/supabase/client';

interface CaptureEmailLeadParams {
  email: string;
  source: 'exit_intent' | 'landing_page';
}

export async function captureEmailLead({ email, source }: CaptureEmailLeadParams) {
  try {
    // 1. Save lead to database
    const { data: lead, error: leadError } = await supabase
      .from('quiz_leads')
      .insert({
        email,
        source,
        captured_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (leadError) throw leadError;

    // 2. Get the guide download URL from Supabase storage
    const { data: urlData } = supabase.storage
      .from('public-assets')
      .getPublicUrl('guides/picky-eater-food-chaining-guide.pdf');

    const guideUrl = urlData.publicUrl;

    // 3. Queue email with guide link
    const { error: emailError } = await supabase
      .from('automation_email_queue')
      .insert({
        to_email: email,
        subject: '🎁 Your Free Picky Eater Guide is Here!',
        template_key: 'exit_intent_guide',
        html_body: generateGuideEmailHTML(guideUrl),
        text_body: generateGuideEmailText(guideUrl),
        scheduled_for: new Date().toISOString(),
        status: 'pending',
        priority: 5,
      });

    if (emailError) throw emailError;

    return { success: true, leadId: lead.id };
  } catch (error) {
    console.error('Error capturing email lead:', error);
    throw error;
  }
}

function generateGuideEmailHTML(guideUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Free Picky Eater Guide</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%); padding: 40px 40px 30px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 16px;">🍽️</div>
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Your Free Guide is Ready!</h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #374151;">
                Hi there! 👋
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #374151;">
                Thanks for your interest in helping your picky eater! We've put together this guide based on evidence-based strategies that have helped thousands of parents.
              </p>
              
              <h2 style="margin: 30px 0 15px; font-size: 20px; font-weight: bold; color: #1f2937;">
                Inside Your Guide:
              </h2>
              <ul style="margin: 0 0 30px; padding-left: 20px; color: #374151; line-height: 1.8;">
                <li>5 proven food chaining techniques that actually work</li>
                <li>Sample meal plan template you can start using today</li>
                <li>Age-appropriate strategies for kids 2-12</li>
                <li>Tips to reduce mealtime stress for the whole family</li>
              </ul>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${guideUrl}" 
                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%); color: #ffffff; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(255, 107, 107, 0.3);">
                      Download Your Free Guide
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 20px; font-size: 16px; line-height: 1.6; color: #374151;">
                Want even more help? <a href="https://tryeatpal.com/auth?tab=signup" style="color: #FF6B6B; text-decoration: none; font-weight: 600;">Try EatPal free</a> to create personalized meal plans your kids will actually eat, auto-generate grocery lists, and track real progress.
              </p>
              
              <p style="margin: 20px 0 0; font-size: 16px; line-height: 1.6; color: #374151;">
                To your family's success,<br>
                <strong>The EatPal Team</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #6b7280;">
                EatPal - Turning Picky Eaters into Adventurous Eaters
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                You're receiving this because you requested our free guide at tryeatpal.com
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function generateGuideEmailText(guideUrl: string): string {
  return `
Your Free Picky Eater Guide is Ready!

Hi there!

Thanks for your interest in helping your picky eater! We've put together this guide based on evidence-based strategies that have helped thousands of parents.

Inside Your Guide:
- 5 proven food chaining techniques that actually work
- Sample meal plan template you can start using today
- Age-appropriate strategies for kids 2-12
- Tips to reduce mealtime stress for the whole family

Download your guide here: ${guideUrl}

Want even more help? Try EatPal free to create personalized meal plans your kids will actually eat, auto-generate grocery lists, and track real progress.

Visit: https://tryeatpal.com/auth?tab=signup

To your family's success,
The EatPal Team

---
EatPal - Turning Picky Eaters into Adventurous Eaters
You're receiving this because you requested our free guide at tryeatpal.com
  `.trim();
}
