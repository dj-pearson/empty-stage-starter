# EatPal Admin Automation Strategy
## Complete Self-Contained Enterprise System

**Last Updated:** 2025-10-13
**Goal:** Build a fully automated sales and marketing engine that eliminates dependency on third-party tools (except AI, Resend, and Supabase)

---

## Executive Summary

This document outlines the strategy to transform EatPal's Admin system into a complete, automated enterprise platform that handles the entire customer lifecycle from first contact through conversion, retention, and growth - all without external CRM, marketing automation, or analytics tools.

### Core Dependencies (Allowed)
- ✅ **AI** - OpenAI/Anthropic for content generation
- ✅ **Resend API** - Email delivery service
- ✅ **Supabase** - Database and authentication

### Third-Party Tools to Replace
- ❌ SEMRush / Ahrefs → Built our own SEO Manager
- ❌ HubSpot / Salesforce → Building complete CRM
- ❌ Mailchimp / ActiveCampaign → Building email automation
- ❌ Intercom / Zendesk → Built Support Tickets system
- ❌ Google Analytics Premium → Building analytics dashboard
- ❌ Mixpanel / Amplitude → Building event tracking
- ❌ Zapier / Make → Building workflow automation

---

## Current State Analysis

### Existing Admin Functions (14 modules)

| Module | Status | Completeness | Missing Features |
|--------|--------|--------------|------------------|
| User Management | ✅ Complete | 95% | Auto-ban rules, bulk actions |
| Subscription Management | ✅ Complete | 90% | Usage-based billing, dunning |
| Lead Campaign Manager | ⚠️ Partial | 70% | Email sending, automation, tasks |
| Email Marketing Manager | ⚠️ Skeleton | 30% | Templates, campaigns, automation |
| SEO Manager | ✅ Complete | 95% | Structured data, mobile optimization |
| Blog CMS | ✅ Complete | 90% | Scheduled publishing, co-authors |
| Social Media Manager | ✅ Complete | 85% | Auto-posting, analytics integration |
| Promotional Campaigns | ✅ Complete | 85% | Dynamic pricing, tiered discounts |
| Feature Flags | ✅ Complete | 90% | Multivariate testing, rollout % |
| Support Tickets | ✅ Complete | 85% | SLA tracking, canned responses |
| Analytics Dashboard | ✅ Complete | 90% | Custom reports, data export |
| Complementary Subscriptions | ✅ Complete | 95% | Expiry management |
| Nutrition Database | ✅ Complete | 90% | Bulk import, API enrichment |
| AI Settings | ✅ Complete | 95% | Budget alerts, model switching |

### Critical Gaps

#### 1. **Contact Form → Lead Database (BROKEN)**
**File:** `src/pages/Contact.tsx:20-30`
```typescript
// Currently just shows toast, doesn't save
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  await new Promise(resolve => setTimeout(resolve, 1000));
  toast.success("Message sent!"); // ❌ FAKE
};
```

**Impact:** Losing every contact form submission. No lead tracking.

#### 2. **Email Automation (INCOMPLETE)**
**Tables Exist:** `email_queue`, `email_templates`, `email_campaigns`
**Edge Function Ready:** `supabase/functions/send-emails/index.ts`
**Missing:**
- Automated trigger workflows
- Drip campaigns
- Template personalization
- Behavioral email sequences

#### 3. **Sales Funnel Automation (NON-EXISTENT)**
No automation layer exists:
- No welcome emails on signup
- No trial nurturing
- No conversion reminders
- No churn prevention
- Manual lead status updates only

#### 4. **Attribution & ROI Tracking (LIMITED)**
**Table Exists:** `campaign_analytics`
**Missing:**
- Multi-touch attribution
- Cost per acquisition tracking
- Channel ROI dashboard
- Cohort revenue analysis

---

## Automation Strategy: Complete Sales Funnel

### The Customer Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                     AWARENESS STAGE                              │
├─────────────────────────────────────────────────────────────────┤
│ Landing Page Visit → Contact Form / Newsletter → Lead Created   │
│ [UTM Tracking] [Auto-score] [Campaign Attribution]              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    CONSIDERATION STAGE                           │
├─────────────────────────────────────────────────────────────────┤
│ Email Sequence (Days 0, 1, 3, 7) → Pricing Page Visit           │
│ [Nurture Content] [Value Props] [Social Proof] [CTA]            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      TRIAL STAGE                                 │
├─────────────────────────────────────────────────────────────────┤
│ Trial Signup → Onboarding → Feature Adoption → Trial Ending     │
│ [Welcome Email] [Usage Tracking] [Help Prompts] [Upgrade Push]  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    CONVERSION STAGE                              │
├─────────────────────────────────────────────────────────────────┤
│ Payment Added → Subscription Active → Thank You + Invoice       │
│ [Conversion Event] [Revenue Attribution] [Advanced Features]    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     RETENTION STAGE                              │
├─────────────────────────────────────────────────────────────────┤
│ Ongoing Usage → Health Score → Renewal → Upsell                 │
│ [Check-ins] [Feature Announcements] [Referral Asks] [Surveys]   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Foundation (Fixes 1-4) - THIS PHASE

#### Fix 1: Contact Form Lead Capture
**File:** `src/pages/Contact.tsx`

**Changes:**
1. Create `submitContactLead()` function
2. Insert into `leads` table with source='contact_form'
3. Auto-create lead interaction record
4. Trigger welcome email via email_queue
5. Calculate initial lead score
6. Show success message with tracking

**Database Flow:**
```sql
INSERT INTO leads (email, full_name, source, notes, metadata)
→ TRIGGER: calculate_lead_score()
→ INSERT INTO lead_interactions (type='form_submission')
→ INSERT INTO email_queue (template='contact_welcome', to_email, scheduled_for=NOW())
```

**Implementation:** Create utility function `src/lib/lead-capture.ts`

#### Fix 2: Email Automation Engine
**New File:** `src/lib/email-automation.ts`

**Core Functions:**
- `triggerEmailSequence(userId, sequenceType)` - Start automated sequence
- `scheduleEmail(to, template, sendAt, variables)` - Queue email
- `processEmailTriggers()` - Background job to check conditions
- `trackEmailEvent(emailId, eventType)` - Track opens/clicks

**Email Sequences to Build:**
1. **Contact Form Welcome** (3 emails over 7 days)
2. **Trial Onboarding** (5 emails over 14 days)
3. **Trial Ending** (3 reminder emails at days -3, -1, 0)
4. **New Customer Welcome** (2 emails)
5. **Inactive User Re-engagement** (3 emails over 30 days)
6. **Churn Win-back** (4 emails over 60 days)

**Template Variables:**
- `{{first_name}}`
- `{{trial_days_left}}`
- `{{kids_count}}`
- `{{feature_name}}`
- `{{discount_code}}`

#### Fix 3: Lead Scoring Automation
**File:** `supabase/migrations/[new]_enhanced_lead_scoring.sql`

**Enhanced Scoring Criteria:**
```typescript
Base Score (0-100):
+ 10 points: Has email
+ 10 points: Has name
+ 15 points: Has phone
+ 20 points: Referral source
+ 25 points: Trial signup source
+ 10 points: Email opened (per email, max 30)
+ 15 points: Email clicked (per click, max 30)
+ 20 points: Pricing page visit
+ 25 points: Added payment method
+ 10 points: Contacted in last 7 days
+ 15 points: High engagement (3+ interactions)
```

**Automated Actions by Score:**
- Score ≥ 80: Auto-assign to admin, send notification, mark as "qualified"
- Score 60-79: Add to high-priority nurture sequence
- Score 40-59: Standard nurture sequence
- Score < 40 after 30 days: Mark as "unqualified", stop emails

#### Fix 4: Trial-to-Paid Conversion Automation
**New File:** `src/lib/trial-automation.ts`

**Automated Workflows:**

**A. Trial Started**
```typescript
TRIGGER: user_subscriptions.status = 'trialing'
ACTIONS:
→ Send welcome email (immediate)
→ Create onboarding checklist
→ Schedule Day 2 check-in email
→ Schedule Day 7 feature highlight email
→ Schedule Day 12 upgrade prompt email
→ Create admin notification if high-value lead
```

**B. Trial Activity Tracking**
```typescript
MONITOR: User activity daily
IF logins < 2 AND days_in_trial > 3:
  → Send "Need help?" email
IF kids_added = 0 AND days_in_trial > 2:
  → Send "Add your first child" prompt
IF meals_logged > 10 AND days_in_trial > 5:
  → Send "You're a power user!" + upgrade offer
```

**C. Trial Ending Soon**
```typescript
TRIGGER: trial_end_date - NOW() = 3 days
ACTIONS:
→ Send "Trial ending" email with CTA
→ Increase email frequency
→ Show in-app upgrade prompts

TRIGGER: trial_end_date - NOW() = 1 day
ACTIONS:
→ Send "Last chance" email with 20% discount
→ Create urgent task for admin follow-up

TRIGGER: trial_end_date - NOW() = 0 days
ACTIONS:
→ Send "Trial expired" email
→ Mark as "lost" if no conversion
→ Schedule win-back sequence (30 days later)
```

**D. Conversion Success**
```typescript
TRIGGER: user_subscriptions.status = 'trialing' → 'active'
ACTIONS:
→ Send thank you email + invoice
→ Send "Advanced features" guide
→ Cancel all trial-related emails
→ Start retention email sequence
→ Update lead.status = 'converted'
→ Track conversion in campaign_analytics
→ Create admin success notification
```

---

### Phase 2: CRM Enhancement (Week 3-4)

#### 5. Email Sending from Admin Panel
**File:** `src/components/admin/LeadCampaignManager.tsx:580`

Add "Send Email" functionality to lead actions:
- Rich text email composer
- Template selector
- Track email sends in lead_interactions
- Log in email_queue
- Track opens/clicks

#### 6. Lead Activity Timeline
Show complete lead journey:
- Form submissions
- Email opens/clicks
- Page views
- Status changes
- Notes/calls
- Meeting scheduled

#### 7. Task Management
For each lead:
- Follow-up reminders
- Call scheduling
- Meeting notes
- Automated task creation based on score/status

#### 8. Abandoned Action Recovery
Track and recover:
- Signup started but not completed
- Trial signup abandoned mid-flow
- Pricing viewed but no signup
- Payment method not added

---

### Phase 3: Analytics & Attribution (Month 2)

#### 9. Multi-Touch Attribution
Track entire customer journey:
```
First Touch → Middle Touches → Last Touch → Conversion
(Organic)     (Email, Social)   (Paid Ad)     ($49/mo)
```

Implement attribution models:
- First touch
- Last touch
- Linear (equal credit)
- Time decay
- Position-based (40-20-40)

#### 10. Campaign ROI Dashboard
**New Tab in AdminDashboard.tsx:**
```typescript
Metrics per campaign:
- Total spend
- Leads generated
- Cost per lead
- Trial signups
- Trial→Paid conversion rate
- Revenue generated
- CAC (Customer Acquisition Cost)
- LTV:CAC ratio
- Payback period
```

#### 11. Cohort Analysis
Group users by signup month/source:
- Retention curves
- Revenue per cohort
- Churn rates over time
- Feature adoption by cohort

#### 12. Funnel Visualization
Visual drop-off analysis:
```
1000 Landing Views
  → 200 Lead Captures (20%)
    → 50 Trial Starts (25%)
      → 15 Paid Conversions (30%)
        → Overall: 1.5% conversion rate
```

Highlight biggest drop-off points for optimization.

---

### Phase 4: Advanced Automation (Month 3+)

#### 13. Visual Workflow Builder
**New Module:** `src/components/admin/WorkflowBuilder.tsx`

Drag-and-drop automation:
- Triggers (events that start workflows)
- Conditions (if/then logic)
- Actions (send email, update field, create task)
- Delays (wait X days)
- Branches (A/B test paths)

Example workflow:
```
[Trigger: Lead Created]
  ↓
[Condition: Score > 60?]
  ├─ Yes → [Send Premium Email] → [Assign to Sales]
  └─ No → [Wait 2 days] → [Send Educational Email]
```

#### 14. Predictive Analytics
**Machine Learning Models:**
- Churn risk score (0-100)
- Likelihood to convert (0-100)
- Optimal contact time
- Best email subject lines
- Upsell propensity

Train on historical data, update predictions nightly.

#### 15. Dynamic Segmentation
**New File:** `src/lib/segmentation.ts`

Auto-updating segments:
- "High-value leads" (score > 80)
- "Trial about to end" (3 days left)
- "Power users" (usage > 90th percentile)
- "At-risk customers" (churn score > 70)
- "Expansion opportunities" (usage near limits)

Use segments for:
- Targeted campaigns
- Custom pricing
- Priority support
- Feature beta access

#### 16. A/B Testing Framework
Test variations of:
- Email subject lines
- Email content
- Landing page copy
- Pricing displays
- CTA buttons
- Onboarding flows

**Implementation:**
- Automatic traffic split
- Statistical significance calculator
- Winner auto-promotion
- Multi-armed bandit optimization

---

## Technical Architecture

### Database Schema (Already Exists)

**Core Tables:**
- `leads` - All potential customers
- `campaigns` - Marketing campaigns
- `lead_interactions` - Activity log
- `email_queue` - Outbound emails
- `email_templates` - Reusable templates
- `email_events` - Opens, clicks, bounces
- `user_subscriptions` - Trial and paid status
- `campaign_analytics` - Performance metrics

**New Tables Needed:**
```sql
-- Email sequences
CREATE TABLE email_sequences (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL, -- 'trial_start', 'lead_created', etc.
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE email_sequence_steps (
  id UUID PRIMARY KEY,
  sequence_id UUID REFERENCES email_sequences(id),
  step_order INTEGER NOT NULL,
  delay_days INTEGER NOT NULL,
  delay_hours INTEGER DEFAULT 0,
  template_id UUID REFERENCES email_templates(id),
  condition_rules JSONB -- Optional: send only if conditions met
);

-- User sequence enrollment
CREATE TABLE user_email_sequences (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  sequence_id UUID REFERENCES email_sequences(id),
  current_step INTEGER DEFAULT 0,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  UNIQUE(user_id, sequence_id)
);

-- Lead scoring history
CREATE TABLE lead_score_history (
  id UUID PRIMARY KEY,
  lead_id UUID REFERENCES leads(id),
  old_score INTEGER,
  new_score INTEGER,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow automation
CREATE TABLE workflows (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_conditions JSONB,
  actions JSONB NOT NULL, -- Array of actions to perform
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workflow_executions (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id),
  entity_id UUID, -- Lead, user, etc.
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT, -- 'running', 'completed', 'failed'
  error_message TEXT
);

-- Attribution tracking
CREATE TABLE touchpoints (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  lead_id UUID REFERENCES leads(id),
  touchpoint_type TEXT NOT NULL, -- 'ad_click', 'email_open', 'page_view'
  campaign_id UUID REFERENCES campaigns(id),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Edge Functions (Supabase)

**Existing:**
- `send-emails` - Process email queue with Resend API

**New Functions Needed:**
```typescript
// supabase/functions/process-email-sequences/index.ts
// Runs every hour, checks enrolled users, schedules next step

// supabase/functions/process-workflows/index.ts
// Runs every 5 minutes, executes active workflows

// supabase/functions/calculate-attribution/index.ts
// Runs nightly, calculates multi-touch attribution

// supabase/functions/update-lead-scores/index.ts
// Runs every hour, recalculates scores based on recent activity

// supabase/functions/trial-monitoring/index.ts
// Runs hourly, checks trial status, triggers emails
```

### Background Jobs (Cron)

Set up in Supabase dashboard:
```
0 * * * * - process-email-sequences (hourly)
*/5 * * * * - process-workflows (every 5 min)
0 2 * * * - calculate-attribution (nightly at 2am)
0 * * * * - update-lead-scores (hourly)
0 * * * * - trial-monitoring (hourly)
0 6 * * * - send-admin-digest (daily at 6am)
```

---

## Success Metrics

### Key Performance Indicators (KPIs)

**Lead Generation:**
- Total leads per week
- Cost per lead by channel
- Lead-to-trial conversion rate
- Average lead score

**Trial Conversions:**
- Trial signup rate from leads
- Trial-to-paid conversion rate
- Average time to convert
- Conversion rate by source

**Revenue Metrics:**
- Monthly Recurring Revenue (MRR)
- Annual Recurring Revenue (ARR)
- Customer Acquisition Cost (CAC)
- Lifetime Value (LTV)
- LTV:CAC ratio (target: > 3:1)
- Payback period (target: < 12 months)

**Retention:**
- Monthly churn rate (target: < 5%)
- Net Revenue Retention (target: > 100%)
- Customer health score distribution
- Support ticket resolution time

**Automation Efficiency:**
- Email open rates (target: > 25%)
- Email click rates (target: > 3%)
- Automated emails sent per day
- Manual interventions required per week
- Admin time saved per month

---

## Migration from External Tools

### Current Tool Replacement Plan

| External Tool | Cost/mo | EatPal Replacement | Status |
|--------------|---------|-------------------|--------|
| SEMRush | $99-$450 | SEO Manager | ✅ Complete |
| HubSpot CRM | $45-$1200 | Lead Campaign Manager + enhancements | 🔄 In Progress |
| ActiveCampaign | $29-$259 | Email automation engine | 🔄 Phase 1 |
| Intercom | $74-$395 | Support Tickets | ✅ Complete |
| Mixpanel | $25-$833 | Analytics Dashboard | 🔄 Phase 3 |
| Zapier | $29-$799 | Workflow Builder | 📅 Phase 4 |
| **Total Savings** | **$301-$3,935/mo** | **$3,600-$47,220/year** | - |

---

## Maintenance & Monitoring

### Daily Checks (Automated)
- Email queue processing status
- Email delivery rate
- Workflow execution errors
- Lead score anomalies
- Trial expiry count

### Weekly Reviews (Manual)
- New leads and sources
- Conversion rates by channel
- Email performance (open/click rates)
- High-score leads not contacted
- Workflow performance

### Monthly Analysis (Manual)
- MRR and ARR trends
- Churn analysis
- Campaign ROI
- Feature adoption
- Customer feedback themes

---

## Next Steps

### Immediate Actions (This Session)
1. ✅ Create this strategy document
2. ⏳ Implement Fix 1: Contact Form Lead Capture
3. ⏳ Implement Fix 2: Email Automation Engine
4. ⏳ Implement Fix 3: Enhanced Lead Scoring
5. ⏳ Implement Fix 4: Trial Conversion Automation

### Follow-up Sessions
- Week 2: CRM enhancements (email sending, timeline, tasks)
- Week 3-4: Analytics & attribution
- Month 2: Advanced segmentation & reporting
- Month 3+: Workflow builder & predictive analytics

---

## Appendix

### Email Template Library

**1. Contact Form Welcome**
```
Subject: Thanks for reaching out to EatPal!
Body: Hi {{first_name}}, We received your message...
CTA: Start Free Trial
```

**2. Trial Welcome**
```
Subject: Welcome to EatPal! Here's how to get started
Body: Congratulations on starting your free trial...
CTA: Add Your First Child
```

**3. Trial Day 3 - No Activity**
```
Subject: Need help with EatPal?
Body: We noticed you haven't logged in yet...
CTA: Watch Quick Start Video
```

**4. Trial Day 12 - High Usage**
```
Subject: You're crushing it! Upgrade to unlock more
Body: You've logged {{meals_logged}} meals...
CTA: Upgrade Now - 20% Off
```

**5. Trial Ending Tomorrow**
```
Subject: Your EatPal trial ends tomorrow
Body: Don't lose access to your meal plans...
CTA: Subscribe to Continue
```

(More templates to be created during implementation)

### UTM Parameter Standards

```
Source: Where traffic comes from
  - facebook, google, newsletter, referral, organic

Medium: Marketing channel type
  - cpc, email, social, affiliate, referral

Campaign: Specific campaign name
  - summer_2025, trial_promo, partner_abc

Content: Variation identifier (for A/B testing)
  - version_a, banner_green, cta_trial
```

### Lead Scoring Rubric (Detailed)

| Activity | Points | Max | Reasoning |
|----------|--------|-----|-----------|
| Has email | 10 | 10 | Required for contact |
| Has full name | 10 | 10 | Shows intent |
| Has phone | 15 | 15 | High commitment signal |
| Referral source | 20 | 20 | Pre-qualified |
| Trial signup | 25 | 25 | Strong buying intent |
| Email opened | 5 | 30 | Engagement signal |
| Email clicked | 15 | 30 | Active interest |
| Pricing viewed | 20 | 20 | Consideration stage |
| Payment added | 25 | 25 | Near conversion |
| Form submission | 10 | 10 | Inbound interest |
| Social follow | 5 | 5 | Brand awareness |
| Blog engagement | 5 | 15 | Education stage |
| Demo requested | 30 | 30 | High intent |
| Recent contact (7d) | 10 | 10 | Timing bonus |

**Maximum Possible Score:** 100 (capped)

---

**Document Owner:** EatPal Product Team
**Last Review:** 2025-10-13
**Next Review:** 2025-11-13
