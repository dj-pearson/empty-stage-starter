# 🍽️ Munch Maker Mate

A comprehensive meal planning and nutrition tracking app for families, featuring mobile barcode scanning to easily add food items to your database.

## Project info

**URL**: https://lovable.dev/projects/0a0b8449-45e0-417b-8fdc-b0b7778c05e6  
**GitHub**: https://github.com/dj-pearson/empty-stage-starter

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/0a0b8449-45e0-417b-8fdc-b0b7778c05e6) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- **Frontend**: Vite, TypeScript, React, shadcn-ui, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Authentication, Edge Functions)
- **Mobile**: Capacitor, Barcode Scanner
- **APIs**: Open Food Facts, USDA FoodData Central, FoodRepo

## 📱 Mobile Features

- ✅ **Barcode Scanner**: Camera-based product scanning
- ✅ **Multi-API Lookup**: Searches 3 nutrition databases automatically
- ✅ **Auto-add Nutrition**: Scanned products populate your database
- ✅ **iOS & Android**: Deploy to both platforms

### Mobile Deployment

See our comprehensive guides:

- 📖 **[MOBILE_DEPLOYMENT.md](./MOBILE_DEPLOYMENT.md)** - Complete step-by-step guide
- 🚀 **[QUICK_START.md](./QUICK_START.md)** - Quick reference for mobile setup
- 🔐 **[ENV_SETUP.md](./ENV_SETUP.md)** - Environment configuration

Quick mobile setup:

```bash
npm install
npm run build
npm run mobile:add:android    # or mobile:add:ios
npm run mobile:run:android    # or mobile:run:ios
```

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/0a0b8449-45e0-417b-8fdc-b0b7778c05e6) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## 🤖 AI Integration & Development Tools

This project includes advanced AI integration capabilities:

### Supabase MCP (Model Context Protocol)

Direct AI assistant access to your Supabase database through natural language commands.

**Features**:
- ✅ Database querying and management
- ✅ Edge Function deployment and invocation
- ✅ Schema inspection and migrations
- ✅ Real-time debugging and analysis

**Setup**: See [SUPABASE_MCP_SETUP.md](./SUPABASE_MCP_SETUP.md) for complete configuration guide.

**Quick Example**:
```
Claude, show me all tables in the database
Claude, query the seo_content_optimization table
Claude, list all Edge Functions
```

### SEO Content Optimizer

AI-powered content optimization with detailed suggestions:

**Features**:
- ✅ Title & meta description optimization
- ✅ LSI keyword suggestions
- ✅ Content gap analysis vs competitors
- ✅ Semantic keyword analysis
- ✅ Before/after rewrite examples

**Location**: Admin Panel → SEO Manager → Content Optimizer

**Documentation**: See [CONTENT_OPTIMIZER_GUIDE.md](./CONTENT_OPTIMIZER_GUIDE.md)

