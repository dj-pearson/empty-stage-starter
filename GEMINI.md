# GEMINI.md

## Project Overview

This is the repository for **Munch Maker Mate** (also referred to as **EatPal**), a comprehensive meal planning and nutrition tracking application designed for families.

The project is a full-stack application with a web client, a mobile client, and a backend powered by Supabase.

*   **Web Client:** Built with React, Vite, TypeScript, and styled with Tailwind CSS and shadcn-ui. It is optimized for deployment on Cloudflare Pages.
*   **Mobile Client:** A cross-platform application for iOS and Android, built with React Native and Expo. It utilizes native device features like the camera for barcode scanning (via `expo-camera`) and image picking (`expo-image-picker`).
*   **Backend:** The backend is powered by Supabase, providing a PostgreSQL database, authentication, and serverless Edge Functions.
*   **3D Features:** The application includes 3D features, likely for data visualization or enhanced user experience, using `@react-three/fiber` and `@react-three/drei`.

## Building and Running

### Web Application

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:8080`.

3.  **Build for Production:**
    ```bash
    npm run build
    ```
    The production-ready assets will be generated in the `dist` directory.

### Mobile Application

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Start the Expo Development Server:**
    ```bash
    npm run expo:start
    ```
    This will open the Expo developer tools in your browser. You can then run the app on a simulator or a physical device.

3.  **Run on a Simulator/Device:**
    *   **iOS:**
        ```bash
        npm run expo:ios
        ```
    *   **Android:**
        ```bash
        npm run expo:android
        ```

4.  **Build for Production:**
    *   **iOS:**
        ```bash
        npm run eas:build:ios:production
        ```
    *   **Android:**
        ```bash
        npm run eas:build:android:production
        ```

## Testing

*   **Unit Tests:**
    ```bash
    npm run test
    ```
    This runs the unit tests using Vitest.

*   **End-to-End Tests:**
    ```bash
    npm run test:e2e
    ```
    This runs end-to-end tests using Playwright.

## Development Conventions

*   **Code Style:** The project uses Prettier for code formatting. To format the code, run:
    ```bash
    npm run format
    ```
*   **Linting:** ESLint is used for linting. To check for linting errors, run:
    ```bash
    npm run lint
    ```
*   **Branching:** The repository is connected to Lovable, and changes made through the Lovable platform are automatically committed. When working locally, it is recommended to follow standard Git practices (e.g., feature branches).
*   **3D Development:** The project uses Three.js via `@react-three/fiber`. When working with 3D components, be mindful of circular dependencies and refer to the `vite.config.ts` for how these are handled in the build process.
*   **Environment Variables:** Supabase credentials and other secrets should be managed through environment variables and not committed to the repository. Refer to the Supabase documentation for best practices.
