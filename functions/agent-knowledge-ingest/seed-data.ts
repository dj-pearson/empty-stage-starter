/**
 * Knowledge-base seed entries for US-481.
 *
 * Real EatPal FAQ/how-to content lifted verbatim from src/pages/FAQ.tsx so the
 * RAG support agent (US-491) answers from actual product truth. POST
 * `{ "seed": true }` to agent-knowledge-ingest (admin only) to embed and load
 * all of these; re-running is idempotent (each (source, title) pair is
 * re-chunked and replaced).
 */

export interface SeedEntry {
  source: string;
  title: string;
  content: string;
}

export const KNOWLEDGE_SEED: SeedEntry[] = [
  {
    source: 'faq',
    title: 'What is EatPal and how does it work?',
    content:
      "EatPal is a comprehensive meal planning platform designed specifically for parents of picky eaters. You start by building a pantry of your child's safe foods and foods you'd like them to try. Our AI then generates personalized 7-day meal plans that include daily \"try bites\" to gently expand your child's diet. The app also creates automatic grocery lists, tracks food acceptance, and provides nutrition insights.",
  },
  {
    source: 'faq',
    title: 'Is EatPal available now?',
    content:
      'Yes! EatPal is now live and ready to help you plan meals for your picky eater. Sign up today and start creating personalized meal plans with safe foods and try bites.',
  },
  {
    source: 'faq',
    title: 'Is EatPal suitable for children with ARFID or autism?',
    content:
      'Yes! EatPal is designed to support various feeding challenges including ARFID (Avoidant/Restrictive Food Intake Disorder), autism spectrum food sensitivities, sensory processing issues, and typical picky eating. Our platform allows you to track allergens, sensory preferences, and safe foods, making it ideal for children with complex feeding needs. However, EatPal is not a replacement for medical care or feeding therapy.',
  },
  {
    source: 'faq',
    title: 'What are "try bites" and how do they work?',
    content:
      "Try bites are single foods suggested each day for your child to try, based on food chaining principles used by feeding therapists. The goal is gentle exposure without pressure - you simply track whether your child ate it, tasted it, or refused it. Our AI learns from these responses to suggest increasingly appropriate foods that align with your child's preferences and expand their diet gradually.",
  },
  {
    source: 'faq',
    title: 'Can I manage meal plans for multiple children?',
    content:
      'Absolutely! EatPal supports multiple child profiles within one account. Each child can have their own safe foods list, allergen tracking, meal plans, and preferences. This is perfect for families with siblings who have different eating patterns and needs. Premium plans offer unlimited child profiles.',
  },
  {
    source: 'faq',
    title: 'How does the AI meal planning work?',
    content:
      "Our AI analyzes your child's safe foods, recent eating history, nutritional needs, and preferences to create balanced 7-day meal plans. It ensures variety (no repeated meals for 3 days), balanced nutrition across food groups, and respects allergen restrictions. The AI also learns from your feedback - when you mark foods as eaten, tried, or refused, it gets smarter about future suggestions.",
  },
  {
    source: 'faq',
    title: "What's included in the Free plan?",
    content:
      'The Free plan includes basic meal planning features for one child, limited pantry foods, manual meal planning, and basic food tracking. Premium plans unlock AI-powered meal generation, unlimited children, unlimited pantry foods, nutrition tracking, AI food suggestions, recipe builder, and priority support. Check our pricing page for full details.',
  },
  {
    source: 'faq',
    title: 'Can I cancel my subscription anytime?',
    content:
      "Yes, you can cancel your subscription at any time. Your access will continue through the end of your current billing period. We don't offer refunds for partial months, but you won't be charged again after cancellation.",
  },
  {
    source: 'faq',
    title: 'How do I track allergens and dietary restrictions?',
    content:
      "When creating a child profile, you can specify all allergens and dietary restrictions. EatPal will automatically flag foods containing those allergens and exclude them from meal plans. You can also mark individual foods with allergen information, and our AI will never suggest meals containing your child's allergens.",
  },
  {
    source: 'faq',
    title: "Is my child's data private and secure?",
    content:
      "Yes. We take privacy very seriously, especially when it comes to children's information. All data is encrypted, stored securely, and never shared or sold to third parties. We comply with all applicable privacy laws. See our Privacy Policy for complete details on how we protect your family's data.",
  },
  {
    source: 'faq',
    title: 'Can I export my meal plans and grocery lists?',
    content:
      'Yes! You can export all your data including meal plans, grocery lists, food tracking history, and pantry information. This is useful for sharing with healthcare providers, dietitians, or feeding therapists, or simply for your own backup.',
  },
  {
    source: 'faq',
    title: 'Does EatPal work with feeding therapy?',
    content:
      "Yes! Many parents use EatPal alongside feeding therapy. Our food chaining and try bite features are based on evidence-based feeding therapy techniques. You can export your child's food tracking data to share progress with your occupational therapist, speech therapist, or dietitian. However, EatPal is a tool to support therapy, not replace professional treatment.",
  },
  {
    source: 'faq',
    title: 'What if my child only eats 5-10 foods?',
    content:
      "EatPal is designed for exactly this scenario! Even with a very limited safe food list, our platform can create meal plans using those foods while gently suggesting similar foods to try. The AI uses food chaining principles to recommend new foods that share textures, temperatures, or flavors with your child's safe foods, making expansion more likely to succeed.",
  },
  {
    source: 'faq',
    title: 'How do I get support if I have issues?',
    content:
      "You can contact our support team at Support@TryEatPal.com. We typically respond within 24-48 hours. Premium subscribers receive priority support. We're here to help you get the most out of EatPal!",
  },
  {
    source: 'faq',
    title: 'Is there a mobile app?',
    content:
      'EatPal is currently a web-based application that works great on mobile browsers. You can access it from any device with internet connectivity. Native iOS and Android apps are on our roadmap for future development.',
  },
];
