-- Agentic OS — US-481: seed the knowledge base with real EatPal FAQ entries.
-- Sourced from src/pages/FAQ.tsx. Embeddings are left NULL here (SQL cannot
-- call an embeddings API); the agent-knowledge-ingest function backfills them
-- post-deploy (POST {"backfill": true}). Idempotent via a (source,title) guard.

INSERT INTO public.agent_knowledge (source, title, content, metadata)
SELECT * FROM (
  VALUES
    ('faq', $t$What is EatPal and how does it work?$t$,
     $c$EatPal is a comprehensive meal planning platform designed specifically for parents of picky eaters. You start by building a pantry of your child's safe foods and foods you'd like them to try. Our AI then generates personalized 7-day meal plans that include daily "try bites" to gently expand your child's diet. The app also creates automatic grocery lists, tracks food acceptance, and provides nutrition insights.$c$,
     '{"category":"Getting Started","needs_embedding":true}'::jsonb),
    ('faq', $t$Is EatPal available now?$t$,
     $c$Yes! EatPal is now live and ready to help you plan meals for your picky eater. Sign up today and start creating personalized meal plans with safe foods and try bites.$c$,
     '{"category":"Getting Started","needs_embedding":true}'::jsonb),
    ('faq', $t$Is EatPal suitable for children with ARFID or autism?$t$,
     $c$Yes! EatPal is designed to support various feeding challenges including ARFID (Avoidant/Restrictive Food Intake Disorder), autism spectrum food sensitivities, sensory processing issues, and typical picky eating. Our platform allows you to track allergens, sensory preferences, and safe foods, making it ideal for children with complex feeding needs. However, EatPal is not a replacement for medical care or feeding therapy.$c$,
     '{"category":"Features","needs_embedding":true}'::jsonb),
    ('faq', $t$What are "try bites" and how do they work?$t$,
     $c$Try bites are single foods suggested each day for your child to try, based on food chaining principles used by feeding therapists. The goal is gentle exposure without pressure - you simply track whether your child ate it, tasted it, or refused it. Our AI learns from these responses to suggest increasingly appropriate foods that align with your child's preferences and expand their diet gradually.$c$,
     '{"category":"Features","needs_embedding":true}'::jsonb),
    ('faq', $t$Can I manage meal plans for multiple children?$t$,
     $c$Absolutely! EatPal supports multiple child profiles within one account. Each child can have their own safe foods list, allergen tracking, meal plans, and preferences. This is perfect for families with siblings who have different eating patterns and needs. Premium plans offer unlimited child profiles.$c$,
     '{"category":"Features","needs_embedding":true}'::jsonb),
    ('faq', $t$How does the AI meal planning work?$t$,
     $c$Our AI analyzes your child's safe foods, recent eating history, nutritional needs, and preferences to create balanced 7-day meal plans. It ensures variety (no repeated meals for 3 days), balanced nutrition across food groups, and respects allergen restrictions. The AI also learns from your feedback - when you mark foods as eaten, tried, or refused, it gets smarter about future suggestions.$c$,
     '{"category":"Features","needs_embedding":true}'::jsonb),
    ('faq', $t$What's included in the Free plan?$t$,
     $c$The Free plan includes basic meal planning features for one child, limited pantry foods, manual meal planning, and basic food tracking. Premium plans unlock AI-powered meal generation, unlimited children, unlimited pantry foods, nutrition tracking, AI food suggestions, recipe builder, and priority support. Check our pricing page for full details.$c$,
     '{"category":"Billing","needs_embedding":true}'::jsonb),
    ('faq', $t$Can I cancel my subscription anytime?$t$,
     $c$Yes, you can cancel your subscription at any time. Your access will continue through the end of your current billing period. We don't offer refunds for partial months, but you won't be charged again after cancellation.$c$,
     '{"category":"Billing","needs_embedding":true}'::jsonb),
    ('faq', $t$How do I track allergens and dietary restrictions?$t$,
     $c$When creating a child profile, you can specify all allergens and dietary restrictions. EatPal will automatically flag foods containing those allergens and exclude them from meal plans. You can also mark individual foods with allergen information, and our AI will never suggest meals containing your child's allergens.$c$,
     '{"category":"Features","needs_embedding":true}'::jsonb),
    ('faq', $t$Is my child's data private and secure?$t$,
     $c$Yes. We take privacy very seriously, especially when it comes to children's information. All data is encrypted, stored securely, and never shared or sold to third parties. We comply with all applicable privacy laws. See our Privacy Policy for complete details on how we protect your family's data.$c$,
     '{"category":"Technical","needs_embedding":true}'::jsonb),
    ('faq', $t$Can I export my meal plans and grocery lists?$t$,
     $c$Yes! You can export all your data including meal plans, grocery lists, food tracking history, and pantry information. This is useful for sharing with healthcare providers, dietitians, or feeding therapists, or simply for your own backup.$c$,
     '{"category":"Features","needs_embedding":true}'::jsonb)
) AS seed(source, title, content, metadata)
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_knowledge ak
  WHERE ak.source = seed.source AND ak.title = seed.title
);
