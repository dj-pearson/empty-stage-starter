/**
 * VideoObject Schema Component
 *
 * Implements schema.org VideoObject for video content SEO.
 * Enables rich video snippets in Google Search with:
 * - Video thumbnail
 * - Duration
 * - Upload date
 * - Description
 * - View count
 *
 * Reference: https://schema.org/VideoObject
 * Google Docs: https://developers.google.com/search/docs/appearance/structured-data/video
 *
 * Usage:
 * ```tsx
 * <VideoSchema
 *   name="How to Create a Picky Eater Meal Plan"
 *   description="Learn how to create an effective meal plan for picky eaters..."
 *   thumbnailUrl="https://tryeatpal.com/videos/thumbnails/meal-plan-tutorial.jpg"
 *   uploadDate="2025-01-15"
 *   duration="PT5M30S"
 *   contentUrl="https://tryeatpal.com/videos/meal-plan-tutorial.mp4"
 *   embedUrl="https://www.youtube.com/embed/abc123xyz"
 * />
 * ```
 */

import { useEffect } from 'react';

export interface VideoSchemaProps {
  /** The title of the video */
  name: string;
  /** A description of the video content (max 5000 characters) */
  description: string;
  /** URL of the video thumbnail image (min 60x30px, recommended 1280x720px) */
  thumbnailUrl: string;
  /** The date the video was first published, in ISO 8601 format (YYYY-MM-DD) */
  uploadDate: string;
  /** The duration of the video in ISO 8601 format (e.g., PT1H30M for 1 hour 30 minutes) */
  duration?: string;
  /** Direct URL to the video file (e.g., .mp4, .webm) */
  contentUrl?: string;
  /** URL to embed the video (e.g., YouTube embed URL) */
  embedUrl?: string;
  /** Optional view count */
  interactionCount?: number;
  /** Optional date the video expires, in ISO 8601 format */
  expires?: string;
  /** Optional additional thumbnail URLs */
  thumbnails?: string[];
  /** Optional transcript or caption URL */
  transcript?: string;
  /** Optional video category/genre */
  genre?: string;
  /** Optional author/creator information */
  author?: {
    name: string;
    url?: string;
  };
  /** Optional publisher information (defaults to EatPal) */
  publisher?: {
    name: string;
    logoUrl: string;
  };
}

export function VideoSchema({
  name,
  description,
  thumbnailUrl,
  uploadDate,
  duration,
  contentUrl,
  embedUrl,
  interactionCount,
  expires,
  thumbnails,
  transcript,
  genre,
  author,
  publisher = {
    name: 'EatPal',
    logoUrl: 'https://tryeatpal.com/Logo-Green.png',
  },
}: VideoSchemaProps) {
  useEffect(() => {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name,
      description,
      thumbnailUrl: thumbnails?.length ? thumbnails : [thumbnailUrl],
      uploadDate,
      ...(duration && { duration }),
      ...(contentUrl && { contentUrl }),
      ...(embedUrl && { embedUrl }),
      ...(interactionCount !== undefined && {
        interactionStatistic: {
          '@type': 'InteractionCounter',
          interactionType: { '@type': 'WatchAction' },
          userInteractionCount: interactionCount,
        },
      }),
      ...(expires && { expires }),
      ...(transcript && { transcript }),
      ...(genre && { genre }),
      ...(author && {
        author: {
          '@type': 'Person',
          name: author.name,
          ...(author.url && { url: author.url }),
        },
      }),
      publisher: {
        '@type': 'Organization',
        name: publisher.name,
        logo: {
          '@type': 'ImageObject',
          url: publisher.logoUrl,
        },
      },
    };

    const scriptId = 'video-schema';
    let scriptTag = document.getElementById(scriptId);

    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.id = scriptId;
      scriptTag.type = 'application/ld+json';
      document.head.appendChild(scriptTag);
    }

    scriptTag.textContent = JSON.stringify(schema);

    return () => {
      const existingScript = document.getElementById(scriptId);
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [
    name,
    description,
    thumbnailUrl,
    uploadDate,
    duration,
    contentUrl,
    embedUrl,
    interactionCount,
    expires,
    thumbnails,
    transcript,
    genre,
    author,
    publisher,
  ]);

  return null;
}

/**
 * Helper function to convert duration in seconds to ISO 8601 format
 *
 * Usage:
 * ```tsx
 * const duration = formatVideoDuration(330); // Returns "PT5M30S"
 * const duration = formatVideoDuration(3665); // Returns "PT1H1M5S"
 * ```
 */
export function formatVideoDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  let duration = 'PT';

  if (hours > 0) {
    duration += `${hours}H`;
  }
  if (minutes > 0) {
    duration += `${minutes}M`;
  }
  if (secs > 0 || (hours === 0 && minutes === 0)) {
    duration += `${secs}S`;
  }

  return duration;
}

/**
 * Helper function to validate video schema data
 *
 * Returns validation errors if any, empty array if valid
 */
export function validateVideoSchema(props: VideoSchemaProps): string[] {
  const errors: string[] = [];

  if (!props.name || props.name.length === 0) {
    errors.push('Video name is required');
  }

  if (!props.description || props.description.length === 0) {
    errors.push('Video description is required');
  }

  if (props.description && props.description.length > 5000) {
    errors.push('Video description must be 5000 characters or less');
  }

  if (!props.thumbnailUrl) {
    errors.push('Thumbnail URL is required');
  }

  if (!props.uploadDate) {
    errors.push('Upload date is required');
  }

  // Validate ISO 8601 date format (basic check)
  if (props.uploadDate && !/^\d{4}-\d{2}-\d{2}/.test(props.uploadDate)) {
    errors.push('Upload date must be in ISO 8601 format (YYYY-MM-DD)');
  }

  // Validate duration format if provided
  if (props.duration && !/^PT(\d+H)?(\d+M)?(\d+S)?$/.test(props.duration)) {
    errors.push('Duration must be in ISO 8601 format (e.g., PT5M30S)');
  }

  // At least one video URL should be provided
  if (!props.contentUrl && !props.embedUrl) {
    errors.push('Either contentUrl or embedUrl must be provided');
  }

  return errors;
}
