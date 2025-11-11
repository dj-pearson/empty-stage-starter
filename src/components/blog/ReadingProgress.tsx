import { useEffect, useState } from "react";

interface ReadingProgressProps {
  postId?: string;
  onProgressChange?: (percentage: number) => void;
}

export function ReadingProgress({ postId, onProgressChange }: ReadingProgressProps) {
  const [progress, setProgress] = useState(0);
  const [milestones, setMilestones] = useState({
    scroll25: false,
    scroll50: false,
    scroll75: false,
    scroll100: false,
  });

  useEffect(() => {
    const updateProgress = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;

      const scrollableHeight = documentHeight - windowHeight;
      const currentProgress = (scrollTop / scrollableHeight) * 100;

      const percentage = Math.min(Math.max(currentProgress, 0), 100);
      setProgress(percentage);

      if (onProgressChange) {
        onProgressChange(percentage);
      }

      // Track reading milestones
      if (percentage >= 25 && !milestones.scroll25) {
        setMilestones((prev) => ({ ...prev, scroll25: true }));
        trackEngagement("scroll_25");
      }
      if (percentage >= 50 && !milestones.scroll50) {
        setMilestones((prev) => ({ ...prev, scroll50: true }));
        trackEngagement("scroll_50");
      }
      if (percentage >= 75 && !milestones.scroll75) {
        setMilestones((prev) => ({ ...prev, scroll75: true }));
        trackEngagement("scroll_75");
      }
      if (percentage >= 99 && !milestones.scroll100) {
        setMilestones((prev) => ({ ...prev, scroll100: true }));
        trackEngagement("scroll_100");
      }
    };

    const trackEngagement = async (eventType: string) => {
      if (!postId) return;

      try {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-engagement`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              post_id: postId,
              event_type: eventType,
              session_id: getSessionId(),
              user_agent: navigator.userAgent,
              referrer: document.referrer,
            }),
          }
        );
      } catch (error) {
        console.error("Error tracking engagement:", error);
      }
    };

    const getSessionId = () => {
      let sessionId = sessionStorage.getItem("blog_session_id");
      if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        sessionStorage.setItem("blog_session_id", sessionId);
      }
      return sessionId;
    };

    window.addEventListener("scroll", updateProgress);
    updateProgress(); // Initial calculation

    return () => {
      window.removeEventListener("scroll", updateProgress);
    };
  }, [postId, milestones]);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-secondary/20">
      <div
        className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

// Table of Contents Component
interface TOCProps {
  content: string;
  currentSection?: string;
}

export function TableOfContents({ content }: TOCProps) {
  const [headings, setHeadings] = useState<Array<{ id: string; text: string; level: number }>>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    // Extract headings from content
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content;

    const headingElements = tempDiv.querySelectorAll("h2, h3");
    const extractedHeadings = Array.from(headingElements).map((heading, index) => {
      const id = heading.id || `heading-${index}`;
      heading.id = id; // Ensure ID exists

      return {
        id,
        text: heading.textContent || "",
        level: parseInt(heading.tagName.substring(1)),
      };
    });

    setHeadings(extractedHeadings);

    // Track which heading is currently in view
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-100px 0px -66%" }
    );

    // Observe all headings
    const actualHeadings = document.querySelectorAll("h2, h3");
    actualHeadings.forEach((heading) => observer.observe(heading));

    return () => {
      actualHeadings.forEach((heading) => observer.unobserve(heading));
    };
  }, [content]);

  if (headings.length === 0) return null;

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <nav className="sticky top-24 max-h-[calc(100vh-200px)] overflow-y-auto bg-secondary/5 border border-border rounded-lg p-4">
      <h4 className="font-heading font-semibold text-sm mb-3 text-foreground">
        Table of Contents
      </h4>
      <ul className="space-y-2 text-sm">
        {headings.map((heading) => (
          <li
            key={heading.id}
            className={`${heading.level === 3 ? "ml-4" : ""}`}
          >
            <button
              onClick={() => scrollToHeading(heading.id)}
              className={`text-left w-full hover:text-primary transition-colors ${
                activeId === heading.id
                  ? "text-primary font-medium"
                  : "text-muted-foreground"
              }`}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Social Share Buttons Component
interface ShareButtonsProps {
  url: string;
  title: string;
  description?: string;
}

export function ShareButtons({ url, title, description }: ShareButtonsProps) {
  const [shareCount, setShareCount] = useState(0);

  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    pinterest: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(title)}`,
  };

  const handleShare = async (platform: string) => {
    setShareCount((prev) => prev + 1);

    // Track share event
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-engagement`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            post_id: url.split("/").pop(),
            event_type: `share_${platform}`,
            session_id: sessionStorage.getItem("blog_session_id"),
          }),
        }
      );
    } catch (error) {
      console.error("Error tracking share:", error);
    }

    // Open share window
    window.open(
      shareLinks[platform as keyof typeof shareLinks],
      "_blank",
      "width=600,height=400"
    );
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      // You could show a toast notification here
      alert("Link copied to clipboard!");
    } catch (error) {
      console.error("Error copying link:", error);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground mr-2">Share:</span>

      <button
        onClick={() => handleShare("twitter")}
        className="p-2 rounded-full hover:bg-secondary transition-colors"
        aria-label="Share on Twitter"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z" />
        </svg>
      </button>

      <button
        onClick={() => handleShare("facebook")}
        className="p-2 rounded-full hover:bg-secondary transition-colors"
        aria-label="Share on Facebook"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
        </svg>
      </button>

      <button
        onClick={() => handleShare("linkedin")}
        className="p-2 rounded-full hover:bg-secondary transition-colors"
        aria-label="Share on LinkedIn"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
          <circle cx="4" cy="4" r="2" />
        </svg>
      </button>

      <button
        onClick={handleCopyLink}
        className="p-2 rounded-full hover:bg-secondary transition-colors"
        aria-label="Copy link"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>

      {shareCount > 0 && (
        <span className="text-xs text-muted-foreground ml-2">
          {shareCount} {shareCount === 1 ? "share" : "shares"}
        </span>
      )}
    </div>
  );
}
