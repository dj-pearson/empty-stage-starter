const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      email, 
      type, // 'confirmation' | 'password_reset' | 'magic_link'
      confirmationUrl,
      resetUrl,
      magicLinkUrl,
      userName 
    } = await req.json();

    if (!email || !type) {
      throw new Error('Email and type are required');
    }

    let subject = '';
    let html = '';

    switch (type) {
      case 'confirmation':
        subject = 'Confirm Your EatPal Account';
        html = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; background: #10b981; color: white; padding: 15px 40px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
                .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Welcome to EatPal! 🎉</h1>
                </div>
                <div class="content">
                  <p>Hi ${userName || 'there'}!</p>
                  
                  <p>Thanks for signing up for EatPal! We're excited to help you make meal planning easier for your picky eater.</p>
                  
                  <p>Please confirm your email address to get started:</p>
                  
                  <div style="text-align: center;">
                    <a href="${confirmationUrl}" class="button">Confirm Email Address</a>
                  </div>
                  
                  <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="${confirmationUrl}" style="color: #10b981; word-break: break-all;">${confirmationUrl}</a>
                  </p>
                  
                  <p>This link will expire in 24 hours.</p>
                  
                  <p>If you didn't create an account with EatPal, you can safely ignore this email.</p>
                  
                  <p>Happy meal planning!<br>The EatPal Team</p>
                </div>
                <div class="footer">
                  <p>EatPal - Making Meal Planning Easy for Picky Eaters</p>
                </div>
              </div>
            </body>
          </html>
        `;
        break;

      case 'password_reset':
        subject = 'Reset Your EatPal Password';
        html = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; background: #10b981; color: white; padding: 15px 40px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
                .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
                .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Reset Your Password 🔐</h1>
                </div>
                <div class="content">
                  <p>Hi there!</p>
                  
                  <p>We received a request to reset your EatPal password. Click the button below to create a new password:</p>
                  
                  <div style="text-align: center;">
                    <a href="${resetUrl}" class="button">Reset Password</a>
                  </div>
                  
                  <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="${resetUrl}" style="color: #10b981; word-break: break-all;">${resetUrl}</a>
                  </p>
                  
                  <div class="warning">
                    <strong>⚠️ Security Notice:</strong><br>
                    This link will expire in 1 hour. If you didn't request a password reset, please ignore this email and your password will remain unchanged.
                  </div>
                  
                  <p>Stay safe,<br>The EatPal Team</p>
                </div>
                <div class="footer">
                  <p>EatPal - Making Meal Planning Easy for Picky Eaters</p>
                </div>
              </div>
            </body>
          </html>
        `;
        break;

      case 'magic_link':
        subject = 'Your EatPal Sign-In Link';
        html = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; background: #10b981; color: white; padding: 15px 40px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
                .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Sign In to EatPal ✨</h1>
                </div>
                <div class="content">
                  <p>Hi there!</p>
                  
                  <p>Click the button below to sign in to your EatPal account:</p>
                  
                  <div style="text-align: center;">
                    <a href="${magicLinkUrl}" class="button">Sign In to EatPal</a>
                  </div>
                  
                  <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="${magicLinkUrl}" style="color: #10b981; word-break: break-all;">${magicLinkUrl}</a>
                  </p>
                  
                  <p>This link will expire in 1 hour.</p>
                  
                  <p>If you didn't request this sign-in link, you can safely ignore this email.</p>
                  
                  <p>Happy meal planning!<br>The EatPal Team</p>
                </div>
                <div class="footer">
                  <p>EatPal - Making Meal Planning Easy for Picky Eaters</p>
                </div>
              </div>
            </body>
          </html>
        `;
        break;

      default:
        throw new Error('Invalid email type');
    }

    // Log email that would be sent (Resend removed - use send-emails function instead)
    console.log(`Auth email prepared: ${type} to ${email}`, { subject });

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in send-auth-email function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};