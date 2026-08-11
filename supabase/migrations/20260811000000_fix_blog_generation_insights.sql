-- get_blog_generation_insights() has never returned a row: the outer SELECT
-- lists columns from blog_title_bank but carries no FROM clause, so Postgres
-- rejects it with 42703 (column "times_used" does not exist) and the admin
-- blog page logs a 400 on every load.
--
-- Three further defects fixed while the function is open:
--   * ORDER BY times_used DESC defaults to NULLS FIRST in Postgres, so a row
--     with a null times_used would be reported as the most-used title.
--   * recent_topics applied LIMIT 20 to the aggregate's single output row,
--     which limits nothing. It now limits the distinct keywords.
--   * the inner LIMIT 100 had no ORDER BY, so "recent" topics were whichever
--     100 rows the planner happened to return.

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
    COUNT(*)::INTEGER AS total_titles,
    COUNT(*) FILTER (WHERE btb.times_used = 0)::INTEGER AS unused_titles,
    (
      SELECT t.title FROM blog_title_bank t
      ORDER BY t.times_used DESC NULLS LAST
      LIMIT 1
    ) AS most_used_title,
    (
      SELECT t.times_used FROM blog_title_bank t
      ORDER BY t.times_used DESC NULLS LAST
      LIMIT 1
    ) AS most_used_count,
    (
      SELECT ARRAY_AGG(kw)
      FROM (
        SELECT DISTINCT UNNEST(recent.keywords) AS kw
        FROM (
          SELECT h.keywords
          FROM blog_generation_history h
          WHERE h.generated_at > NOW() - INTERVAL '30 days'
          ORDER BY h.generated_at DESC
          LIMIT 100
        ) recent
        LIMIT 20
      ) topics
    ) AS recent_topics,
    (
      SELECT ARRAY_AGG(u.title)
      FROM (
        SELECT t.title
        FROM blog_title_bank t
        WHERE t.times_used = 0
        ORDER BY RANDOM()
        LIMIT 10
      ) u
    ) AS recommended_next_topics
  FROM blog_title_bank btb;
END;
$function$;
