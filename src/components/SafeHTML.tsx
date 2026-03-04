import { sanitizeHtml } from '@/lib/sanitize';

interface SafeHTMLProps {
  html: string;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}

/**
 * Renders user-provided HTML content safely using DOMPurify sanitization.
 *
 * Use this component anywhere you need to render dynamic HTML content
 * (blog posts, recipe instructions, AI-generated content, etc.)
 * instead of using dangerouslySetInnerHTML directly.
 *
 * @example
 * <SafeHTML html={blogPost.content} className="prose" />
 * <SafeHTML html={recipe.instructions} as="section" />
 */
export function SafeHTML({ html, className, as: Tag = 'div' }: SafeHTMLProps) {
  const sanitized = sanitizeHtml(html);

  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
