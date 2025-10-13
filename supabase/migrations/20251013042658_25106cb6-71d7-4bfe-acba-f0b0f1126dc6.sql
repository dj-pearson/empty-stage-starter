-- Fix the get_blog_generation_insights function to correctly reference times_used
DROP FUNCTION IF EXISTS get_blog_generation_insights();

CREATE OR REPLACE FUNCTION public.get_blog_generation_insights()
RETURNS TABLE(
  total_titles integer,
  unused_titles integer,
  most_used_title text,
  most_used_count integer,
  recent_topics text[],
  recommended_next_topics text[]
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_titles,
    COUNT(*) FILTER (WHERE btb.times_used = 0)::INTEGER as unused_titles,
    (SELECT btb2.title FROM blog_title_bank btb2 ORDER BY btb2.times_used DESC LIMIT 1) as most_used_title,
    (SELECT btb2.times_used FROM blog_title_bank btb2 ORDER BY btb2.times_used DESC LIMIT 1) as most_used_count,
    (
      SELECT ARRAY_AGG(DISTINCT unnest_val)
      FROM (
        SELECT unnest(bgh.keywords) as unnest_val
        FROM blog_generation_history bgh
        WHERE bgh.generated_at > NOW() - INTERVAL '30 days'
        LIMIT 100
      ) subq
      LIMIT 20
    ) as recent_topics,
    (
      SELECT ARRAY_AGG(btb3.title)
      FROM (
        SELECT btb3.title 
        FROM blog_title_bank btb3
        WHERE btb3.times_used = 0 
        ORDER BY RANDOM() 
        LIMIT 10
      ) btb3
    ) as recommended_next_topics
  FROM blog_title_bank btb;
END;
$function$;