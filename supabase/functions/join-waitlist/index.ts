import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, fullName, referralSource, utmCampaign, utmSource, utmMedium } = await req.json();

    if (!email) {
      throw new Error('Email is required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Insert into waitlist
    const { data: waitlistEntry, error: insertError } = await supabase
      .from('waitlist')
      .insert({
        email,
        full_name: fullName,
        referral_source: referralSource,
        utm_campaign: utmCampaign,
        utm_source: utmSource,
        utm_medium: utmMedium,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        throw new Error('You are already on the waitlist!');
      }
      throw insertError;
    }

    // Send welcome email via Resend
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to the EatPal Waitlist!</h1>
            </div>
            <div class="content">
              <p>Hi ${fullName || 'there'}!</p>
              
              <p>Thank you for joining the EatPal waitlist! You're now among the first to know when we launch our revolutionary meal planning app for picky eaters.</p>
              
              <h3>What's Next?</h3>
              <ul>
                <li><strong>Launch Date:</strong> November 1st, 2025</li>
                <li><strong>Early Access:</strong> Waitlist members get priority access</li>
                <li><strong>Exclusive Perks:</strong> Special launch pricing for early adopters</li>
              </ul>
              
              <p>We're building EatPal to make meal planning effortless for families with picky eaters. Here's what you can look forward to:</p>
              
              <ul>
                <li>✅ 7-day personalized meal plans</li>
                <li>✅ Daily "try bite" suggestions to expand food acceptance</li>
                <li>✅ Auto-generated grocery lists</li>
                <li>✅ Nutrition tracking for limited diets</li>
                <li>✅ Multi-child meal planning support</li>
              </ul>
              
              <p>We'll keep you updated with our progress and let you know as soon as we're ready to launch!</p>
              
              <div style="text-align: center;">
                <a href="https://tryeatpal.com" class="button">Visit Our Website</a>
              </div>
              
              <p>Have questions? Just reply to this email - we'd love to hear from you!</p>
              
              <p>Talk soon,<br>The EatPal Team</p>
            </div>
            <div class="footer">
              <p>EatPal - Making Meal Planning Easy for Picky Eaters</p>
              <p>You're receiving this because you joined our waitlist at tryeatpal.com</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await resend.emails.send({
      from: 'EatPal <welcome@tryeatpal.com>',
      to: [email],
      subject: '🎉 Welcome to the EatPal Waitlist!',
      html: emailHtml,
    });

    console.log('Waitlist entry created and welcome email sent:', email);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Successfully joined waitlist! Check your email for confirmation.' 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in join-waitlist function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});