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
      .from('Assets')
      .getPublicUrl('picky-eater-food-chaining-guide.pdf');

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
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your Free Food Chaining Guide is Here!</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: #f4f4f5;
    }
    a {
      color: #FF8C42;
    }
    @media screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
      }
      .fluid {
        max-width: 100% !important;
        height: auto !important;
      }
      .stack-column {
        display: block !important;
        width: 100% !important;
      }
      .mobile-padding {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5;">
  
  <!-- Preview Text -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    Your free guide with 5 evidence-based food chaining strategies is ready to download! 🎉
  </div>
  
  <!-- Invisible Preheader Spacer -->
  <div style="display: none; max-height: 0px; overflow: hidden;">
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <!-- Email Wrapper -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 10px;">
        
        <!-- Email Container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header with Orange Accent -->
          <tr>
            <td style="background-color: #FF8C42; height: 6px;"></td>
          </tr>
          
          <!-- Logo Section -->
          <tr>
            <td align="center" style="padding: 30px 40px 20px 40px; background-color: #1A1F2E;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 28px; font-weight: bold; color: #ffffff;">
                    🍽️ EatPal
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Hero Section -->
          <tr>
            <td align="center" style="padding: 30px 40px; background-color: #1A1F2E;" class="mobile-padding">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #FF8C42; text-transform: uppercase; letter-spacing: 2px; text-align: center; padding-bottom: 15px;">
                    🎁 Your Free Guide is Ready!
                  </td>
                </tr>
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 28px; font-weight: bold; color: #ffffff; text-align: center; line-height: 1.3; padding-bottom: 15px;">
                    5 Food Chaining Tricks That Actually Work for Picky Eaters
                  </td>
                </tr>
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; color: #94A3B8; text-align: center; line-height: 1.5;">
                    Evidence-based strategies used by feeding therapists to help children ages 2-12 expand their food repertoire.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- CTA Button Section -->
          <tr>
            <td align="center" style="padding: 10px 40px 40px 40px; background-color: #1A1F2E;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="border-radius: 8px; background-color: #FF8C42;">
                    <a href="${guideUrl}" target="_blank" style="display: inline-block; padding: 16px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 8px;">
                      ⬇️ Download Your Free Guide
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- What's Inside Section -->
          <tr>
            <td style="padding: 40px 40px 30px 40px;" class="mobile-padding">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 20px; font-weight: bold; color: #1A1F2E; padding-bottom: 20px;">
                    What's Inside Your Guide:
                  </td>
                </tr>
                
                <!-- Feature 1 -->
                <tr>
                  <td style="padding-bottom: 16px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="40" valign="top">
                          <div style="width: 28px; height: 28px; background-color: #FFF7ED; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px;">✓</div>
                        </td>
                        <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #1A1F2E; line-height: 1.5;">
                          <strong>The Same-But-Different Swap</strong> — Change one property at a time to expand acceptance
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Feature 2 -->
                <tr>
                  <td style="padding-bottom: 16px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="40" valign="top">
                          <div style="width: 28px; height: 28px; background-color: #FFF7ED; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px;">✓</div>
                        </td>
                        <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #1A1F2E; line-height: 1.5;">
                          <strong>The Flavor Bridge Technique</strong> — Use favorite flavors to introduce new foods
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Feature 3 -->
                <tr>
                  <td style="padding-bottom: 16px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="40" valign="top">
                          <div style="width: 28px; height: 28px; background-color: #FFF7ED; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px;">✓</div>
                        </td>
                        <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #1A1F2E; line-height: 1.5;">
                          <strong>The Texture Ladder</strong> — Systematically progress through texture sensitivities
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Feature 4 -->
                <tr>
                  <td style="padding-bottom: 16px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="40" valign="top">
                          <div style="width: 28px; height: 28px; background-color: #FFF7ED; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px;">✓</div>
                        </td>
                        <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #1A1F2E; line-height: 1.5;">
                          <strong>The Visual Familiarity Principle</strong> — Make new foods look safe and appealing
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Feature 5 -->
                <tr>
                  <td style="padding-bottom: 16px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="40" valign="top">
                          <div style="width: 28px; height: 28px; background-color: #FFF7ED; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px;">✓</div>
                        </td>
                        <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #1A1F2E; line-height: 1.5;">
                          <strong>Exposure Without Pressure</strong> — The science of the 15-exposure rule
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Bonus -->
                <tr>
                  <td style="padding-top: 8px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="40" valign="top">
                          <div style="width: 28px; height: 28px; background-color: #DCFCE7; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px;">🎁</div>
                        </td>
                        <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #1A1F2E; line-height: 1.5;">
                          <strong style="color: #16A34A;">BONUS:</strong> Sample 4-week meal plan template included!
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="border-top: 1px solid #E2E8F0;"></td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Next Steps Section -->
          <tr>
            <td style="padding: 30px 40px;" class="mobile-padding">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 20px; font-weight: bold; color: #1A1F2E; padding-bottom: 15px;">
                    Ready to Take It Further?
                  </td>
                </tr>
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #64748B; line-height: 1.6; padding-bottom: 20px;">
                    These strategies work even better when you have the right tools. EatPal automatically applies food chaining science to create personalized meal plans, track your child's progress, and suggest the perfect "bridge foods."
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="border-radius: 8px; border: 2px solid #FF8C42;">
                          <a href="https://tryeatpal.com" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: bold; color: #FF8C42; text-decoration: none; border-radius: 6px;">
                            Start Your Free Trial →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #94A3B8;">
                    No credit card required • Cancel anytime
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #1A1F2E;" class="mobile-padding">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #94A3B8; padding-bottom: 15px;">
                    Join 2,000+ parents who've ended mealtime battles
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 20px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding: 0 10px;">
                          <a href="https://tryeatpal.com" target="_blank" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #FF8C42; text-decoration: none;">Website</a>
                        </td>
                        <td style="color: #64748B;">|</td>
                        <td style="padding: 0 10px;">
                          <a href="https://tryeatpal.com/blog" target="_blank" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #FF8C42; text-decoration: none;">Blog</a>
                        </td>
                        <td style="color: #64748B;">|</td>
                        <td style="padding: 0 10px;">
                          <a href="https://tryeatpal.com/quiz" target="_blank" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #FF8C42; text-decoration: none;">Picky Eater Quiz</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #64748B; line-height: 1.5;">
                    You're receiving this email because you requested our free food chaining guide.<br>
                    Unsubscribe from future emails anytime.
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #64748B;">
                    © 2025 EatPal. All rights reserved.<br>
                    Made with ❤️ for parents of picky eaters
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>
        <!-- End Email Container -->
        
      </td>
    </tr>
  </table>
  <!-- End Email Wrapper -->

</body>
</html>`;
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
