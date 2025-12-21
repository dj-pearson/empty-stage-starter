# Technology Stack

This document outlines the core technologies utilized in the Munch Maker Mate (EatPal) project.

## Frontend

*   **Framework:** React
*   **Build Tool:** Vite
*   **Language:** TypeScript
*   **UI Library:** shadcn-ui (built on Radix UI)
*   **Styling:** Tailwind CSS
*   **Animation:** Framer Motion, GSAP
*   **Other UI Components:** Various Radix UI components for accessibility and common UI patterns.

## Mobile

*   **Framework:** React Native, Expo
*   **Barcode Scanning:** HTML5-QRCode (for web, likely integrated with native camera for mobile via Expo)

## Backend

*   **Platform:** Supabase
    *   **Database:** PostgreSQL
    *   **Authentication:** Supabase Authentication
    *   **Serverless Functions:** Supabase Edge Functions (with Cloudflare Workers integration)

## 3D Features

*   **Libraries:** `@react-three/fiber`, `@react-three/drei`

## Testing

*   **Unit Testing:** Vitest
*   **End-to-End Testing (E2E):** Playwright
*   **Performance Testing:** k6

## Other Notable Libraries and Tools

*   **State Management:** TanStack Query
*   **Form Management & Validation:** React Hook Form, Zod
*   **Date Manipulation:** date-fns
*   **UI Utilities:** clsx, tailwind-merge
*   **Markdown Rendering:** react-markdown, rehype-raw, remark-gfm
*   **Error Tracking:** Sentry
*   **Miscellaneous:** dnd-kit, lottiefiles/react-lottie-player, tiptap (rich text editor), canvas-confetti, jsonwebtoken, jspdf, lucide-react (icons), next-themes, uuid, vaul (dialogs/drawers).
