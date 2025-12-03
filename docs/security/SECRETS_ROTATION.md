# Secrets Rotation Guide

> **Last Updated**: 2025-12-03
> **Owner**: Security Team
> **Review Frequency**: Quarterly

This document outlines the procedures for rotating secrets, API keys, and credentials used by the EatPal application.

## Table of Contents

1. [Overview](#overview)
2. [Secret Inventory](#secret-inventory)
3. [Rotation Schedules](#rotation-schedules)
4. [Rotation Procedures](#rotation-procedures)
5. [Emergency Rotation](#emergency-rotation)
6. [Verification & Rollback](#verification--rollback)
7. [Automation](#automation)

---

## Overview

### Why Rotate Secrets?

- **Limit Exposure Window**: Regular rotation limits the time a compromised secret can be exploited
- **Compliance**: Many regulations (SOC 2, PCI-DSS, HIPAA) require periodic credential rotation
- **Access Control**: Ensures only current team members and systems have access
- **Security Hygiene**: Reduces risk from forgotten or leaked credentials

### Principles

1. **Zero Downtime**: All rotations should be performed without service interruption
2. **Dual-Key Period**: New secrets should coexist with old ones during transition
3. **Automated Verification**: Always verify new secrets work before decommissioning old ones
4. **Audit Trail**: Document all rotation activities

---

## Secret Inventory

### Production Secrets

| Secret Name | Location | Rotation Frequency | Owner |
|------------|----------|-------------------|-------|
| `VITE_SUPABASE_ANON_KEY` | Cloudflare Pages | 90 days | Backend Team |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | 90 days | Backend Team |
| `STRIPE_SECRET_KEY` | Edge Functions | 90 days | Payments Team |
| `STRIPE_WEBHOOK_SECRET` | Edge Functions | 90 days | Payments Team |
| `SENTRY_AUTH_TOKEN` | CI/CD | 180 days | DevOps Team |
| `RESEND_API_KEY` | Edge Functions | 90 days | Backend Team |
| `SNYK_TOKEN` | GitHub Secrets | 180 days | Security Team |
| `EXPO_TOKEN` | GitHub Secrets | 180 days | Mobile Team |
| `EAS_BUILD_PROFILE` | GitHub Secrets | As needed | Mobile Team |
| `GOOGLE_CLIENT_SECRET` | Edge Functions | 90 days | Backend Team |
| `APNS_KEY` | Apple Developer | Annual (with cert) | Mobile Team |
| `FCM_SERVER_KEY` | Firebase Console | 90 days | Mobile Team |

### Development/Staging Secrets

| Secret Name | Location | Rotation Frequency |
|------------|----------|-------------------|
| `VITE_SUPABASE_ANON_KEY` | .env.local | 30 days |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard | 90 days |

---

## Rotation Schedules

### Monthly Review
- [ ] Review access logs for any suspicious activity
- [ ] Check for any secrets approaching rotation deadline
- [ ] Verify secret scanning alerts in GitHub

### Quarterly Rotation (Every 90 Days)
- [ ] Supabase keys
- [ ] Stripe keys
- [ ] Email service keys
- [ ] Push notification keys
- [ ] OAuth client secrets

### Semi-Annual Rotation (Every 180 Days)
- [ ] CI/CD tokens (Sentry, Snyk)
- [ ] EAS/Expo tokens
- [ ] Monitoring service keys

### Annual Rotation
- [ ] Apple Push Notification certificates
- [ ] iOS Distribution certificates
- [ ] Android Keystore passwords

---

## Rotation Procedures

### 1. Supabase Anon Key Rotation

**Pre-requisites**:
- Access to Supabase Dashboard
- Access to Cloudflare Pages settings
- Access to local development environment

**Steps**:

```bash
# 1. Generate new anon key in Supabase Dashboard
#    Go to: Settings > API > Generate new anon key

# 2. Update Cloudflare Pages environment variable
#    Dashboard: Pages > eatpal > Settings > Environment variables
#    Add new variable with same name (will replace old)

# 3. Trigger a new deployment
git commit --allow-empty -m "chore: trigger deployment for secret rotation"
git push origin main

# 4. Verify application works with new key
curl -I https://your-app.pages.dev/

# 5. After 24-48 hours, revoke old key in Supabase Dashboard
```

**Verification**:
```bash
# Test authentication flow
curl -X POST https://your-supabase-url/auth/v1/token?grant_type=password \
  -H "apikey: NEW_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass"}'
```

### 2. Stripe Secret Key Rotation

**Pre-requisites**:
- Stripe Dashboard access (Admin role)
- Access to Supabase Edge Functions secrets

**Steps**:

```bash
# 1. In Stripe Dashboard, go to Developers > API keys
# 2. Click "Roll key" on the Secret key
# 3. Stripe will show both old and new keys

# 4. Update Supabase Edge Function secrets
supabase secrets set STRIPE_SECRET_KEY=sk_live_newkey...

# 5. Test payment functionality
npm run test:e2e -- --grep "payment"

# 6. After verification, expire old key in Stripe Dashboard
```

**Verification Checklist**:
- [ ] Subscription creation works
- [ ] Webhook events are received
- [ ] Customer portal access works
- [ ] Invoice generation works

### 3. Stripe Webhook Secret Rotation

```bash
# 1. In Stripe Dashboard, go to Developers > Webhooks
# 2. Click on your endpoint
# 3. Click "Reveal" under Signing secret, then "Roll secret"

# 4. Update Supabase Edge Function secrets
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_newkey...

# 5. Verify webhooks are being received
# Check Stripe Dashboard > Webhooks > Logs
```

### 4. Sentry Auth Token Rotation

```bash
# 1. Go to Sentry > Settings > Auth Tokens
# 2. Create new token with same permissions

# 3. Update GitHub repository secrets
gh secret set SENTRY_AUTH_TOKEN --body "new-token-value"

# 4. Verify CI/CD works
git commit --allow-empty -m "test: verify sentry token rotation"
git push origin main

# 5. Monitor the build for sourcemap upload success
# 6. Delete old token in Sentry after verification
```

### 5. Resend API Key Rotation

```bash
# 1. Go to Resend Dashboard > API Keys
# 2. Create new API key

# 3. Update Edge Function secrets
supabase secrets set RESEND_API_KEY=re_newkey...

# 4. Test email sending
curl -X POST https://your-project.supabase.co/functions/v1/send-email \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","subject":"Test","body":"Rotation test"}'

# 5. Delete old API key after verification
```

### 6. GitHub Actions Secrets Rotation

```bash
# List current secrets
gh secret list

# Set new secret value
gh secret set SECRET_NAME --body "new-value"

# For organization secrets
gh secret set SECRET_NAME --org your-org --visibility all
```

### 7. Expo/EAS Token Rotation

```bash
# 1. Go to expo.dev > Account Settings > Access Tokens
# 2. Create new token

# 3. Update GitHub secret
gh secret set EXPO_TOKEN --body "new-expo-token"

# 4. Verify mobile builds work
npm run eas:build:ios:preview

# 5. Revoke old token in Expo dashboard
```

---

## Emergency Rotation

### When to Perform Emergency Rotation

- Secret exposed in logs or error messages
- Secret committed to public repository
- Secret shared via insecure channel (email, Slack)
- Team member with access leaves unexpectedly
- Security breach detected

### Emergency Rotation Checklist

```bash
# 1. IMMEDIATELY: Rotate the compromised secret
# Follow the relevant procedure above, but skip waiting periods

# 2. Revoke old secret immediately (don't wait 24-48 hours)

# 3. Review access logs for unauthorized usage
# Supabase: Dashboard > Logs > API
# Stripe: Dashboard > Developers > Logs
# Sentry: Settings > Audit Log

# 4. Document the incident
# Create incident report with:
# - What was exposed
# - How it was exposed
# - When it was rotated
# - Impact assessment

# 5. Review and improve processes to prevent recurrence
```

### Incident Response Template

```markdown
## Secret Exposure Incident Report

**Date**: YYYY-MM-DD
**Secret Type**: [e.g., Stripe API Key]
**Exposure Method**: [e.g., Committed to public repo]
**Duration of Exposure**: [e.g., 2 hours]

### Timeline
- HH:MM - Secret exposed
- HH:MM - Exposure detected
- HH:MM - New secret generated
- HH:MM - Services updated
- HH:MM - Old secret revoked

### Impact Assessment
- [ ] No unauthorized access detected
- [ ] Potential unauthorized access (details below)

### Root Cause
[Describe how the exposure occurred]

### Prevention Measures
[Describe steps to prevent recurrence]
```

---

## Verification & Rollback

### Pre-Rotation Verification

```bash
# 1. Ensure you have rollback access
# - Old secret value documented securely
# - Access to all systems that need updating

# 2. Schedule rotation during low-traffic period
# Check analytics for optimal timing

# 3. Notify relevant team members
# Slack: #deployments channel
```

### Post-Rotation Verification

```bash
# 1. Health check all affected services
curl -I https://your-app.pages.dev/
curl -I https://your-supabase-url/rest/v1/

# 2. Run smoke tests
npm run test:e2e -- --grep "critical"

# 3. Monitor error rates for 1 hour
# Sentry: Check for new errors
# Supabase: Check API logs

# 4. Verify specific functionality
# - Authentication: Login/logout
# - Payments: Test mode transaction
# - Email: Send test email
```

### Rollback Procedure

If issues are detected after rotation:

```bash
# 1. Immediately revert to old secret
# (This is why we keep both active during transition)

# 2. Update environment variables with old secret

# 3. Trigger redeployment
git commit --allow-empty -m "revert: rollback secret rotation"
git push origin main

# 4. Document the failure and investigate root cause
```

---

## Automation

### GitHub Actions Workflow for Scheduled Rotation Reminders

Create `.github/workflows/secret-rotation-reminder.yml`:

```yaml
name: Secret Rotation Reminder

on:
  schedule:
    # Run on the 1st of every month at 9 AM UTC
    - cron: '0 9 1 * *'

jobs:
  check-rotation-schedule:
    runs-on: ubuntu-latest
    steps:
      - name: Check secrets due for rotation
        run: |
          echo "## Monthly Secret Rotation Check" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "Please review the following secrets:" >> $GITHUB_STEP_SUMMARY
          echo "- [ ] Supabase keys (90-day cycle)" >> $GITHUB_STEP_SUMMARY
          echo "- [ ] Stripe keys (90-day cycle)" >> $GITHUB_STEP_SUMMARY
          echo "- [ ] Email service keys (90-day cycle)" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "Refer to docs/security/SECRETS_ROTATION.md for procedures." >> $GITHUB_STEP_SUMMARY

      - name: Create rotation reminder issue
        uses: actions/github-script@v7
        with:
          script: |
            const today = new Date();
            const title = `Monthly Secret Rotation Review - ${today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;

            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: title,
              body: `## Monthly Secret Rotation Review\n\nPlease complete the following checks:\n\n- [ ] Review secrets approaching 90-day rotation\n- [ ] Check for any security alerts\n- [ ] Verify secret scanning is enabled\n- [ ] Update rotation log\n\nRefer to \`docs/security/SECRETS_ROTATION.md\` for detailed procedures.`,
              labels: ['security', 'maintenance']
            });
```

### Secret Rotation Log

Maintain a log of all secret rotations:

| Date | Secret | Rotated By | Verified By | Notes |
|------|--------|------------|-------------|-------|
| YYYY-MM-DD | STRIPE_SECRET_KEY | @username | @username2 | Quarterly rotation |
| YYYY-MM-DD | SUPABASE_ANON_KEY | @username | @username2 | Emergency - exposed in logs |

---

## Security Contacts

- **Security Team Lead**: security@eatpal.com
- **On-Call Engineer**: oncall@eatpal.com
- **Emergency Hotline**: [Internal only]

## Related Documents

- [Security Policy](./SECURITY_POLICY.md)
- [Incident Response Plan](./INCIDENT_RESPONSE.md)
- [Push Notification Certificate Management](./PUSH_NOTIFICATION_CERTS.md)
