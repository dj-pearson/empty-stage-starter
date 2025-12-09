# Backup Restoration Testing Procedures

> **Document Version**: 1.0.0
> **Last Updated**: 2025-12-04
> **Classification**: Internal Use Only
> **Testing Frequency**: Weekly (automated), Monthly (manual), Quarterly (full DR)

---

## Table of Contents

1. [Overview](#overview)
2. [Backup Systems](#backup-systems)
3. [Testing Schedule](#testing-schedule)
4. [Automated Testing](#automated-testing)
5. [Manual Testing Procedures](#manual-testing-procedures)
6. [Verification Checklists](#verification-checklists)
7. [Test Results Documentation](#test-results-documentation)
8. [Troubleshooting](#troubleshooting)
9. [Appendices](#appendices)

---

## Overview

### Purpose

This document establishes procedures for regularly testing backup restoration capabilities to ensure:
- Backups are being created correctly
- Backups can be restored within RTO targets
- Restored data maintains integrity
- Recovery procedures are documented and functional

### Scope

| System | Backup Type | Test Frequency | Owner |
|--------|-------------|----------------|-------|
| PostgreSQL (Supabase) | PITR + Daily | Monthly | DBA |
| User Data Export | On-demand | Weekly | Backend |
| Edge Functions | Git-based | On deployment | DevOps |
| Static Assets | Cloudflare Cache | N/A | CDN |
| Secrets/Config | Manual | Quarterly | Security |

---

## Backup Systems

### Supabase Database Backups

**Type:** Point-in-Time Recovery (PITR)
**Retention:** 7 days (Pro), 30 days (Enterprise)
**Granularity:** Per-second recovery

**Daily Snapshots:**
- Created automatically at 00:00 UTC
- Retained for 7 days
- Stored in separate region

### User Data Export (Edge Function)

**Function:** `backup-user-data`
**Types:** Daily, Weekly, Manual, Export

**Backup Contents:**
```json
{
  "metadata": {
    "user_id": "uuid",
    "backup_type": "manual",
    "created_at": "ISO timestamp",
    "version": "1.0"
  },
  "data": {
    "profile": {...},
    "kids": [...],
    "foods": [...],
    "recipes": [...],
    "plan_entries": [...],
    "grocery_items": [...],
    "settings": {...}
  },
  "record_counts": {
    "kids": 2,
    "foods": 150,
    "recipes": 25,
    "plan_entries": 180,
    "grocery_items": 45
  }
}
```

### Configuration Backups

**Secrets Inventory:**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Google OAuth credentials
- AI API keys

**Storage:** Secure password manager + encrypted backup

---

## Testing Schedule

### Automated Tests (Weekly)

| Test | Day | Time (UTC) | Alert On Failure |
|------|-----|------------|------------------|
| Backup creation | Sunday | 01:00 | Slack + Email |
| Backup integrity | Sunday | 02:00 | Slack + Email |
| Export functionality | Sunday | 03:00 | Slack + Email |

### Manual Tests (Monthly)

| Test | Week | Duration | Team |
|------|------|----------|------|
| Single user restore | 1st | 1 hour | Backend |
| Multi-user restore | 2nd | 2 hours | Backend |
| Full table restore | 3rd | 4 hours | DBA |
| Edge function recovery | 4th | 1 hour | DevOps |

### Full DR Drill (Quarterly)

| Phase | Duration | Participants |
|-------|----------|--------------|
| Preparation | 2 hours | All |
| Execution | 4 hours | All |
| Verification | 2 hours | All |
| Retrospective | 1 hour | All |

---

## Automated Testing

### Backup Creation Verification

**Script Location:** `scripts/backup-test.ts`

```typescript
// scripts/backup-test.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testBackupCreation() {
  console.log('Starting backup creation test...');

  // 1. Trigger backup
  const { data, error } = await supabase.functions.invoke('backup-user-data', {
    body: {
      userId: process.env.TEST_USER_ID,
      backupType: 'manual'
    }
  });

  if (error) {
    console.error('Backup creation failed:', error);
    process.exit(1);
  }

  // 2. Verify backup record
  const { data: backupLog } = await supabase
    .from('backup_logs')
    .select('*')
    .eq('id', data.backup_id)
    .single();

  if (!backupLog || backupLog.status !== 'completed') {
    console.error('Backup record not found or incomplete');
    process.exit(1);
  }

  // 3. Verify data presence
  if (!data.data || data.data.length === 0) {
    console.error('Backup contains no data');
    process.exit(1);
  }

  console.log('Backup creation test PASSED');
  console.log(`Backup ID: ${data.backup_id}`);
  console.log(`Records: ${JSON.stringify(data.records)}`);
}

testBackupCreation().catch(console.error);
```

### Backup Integrity Verification

```typescript
// scripts/backup-integrity-test.ts
async function testBackupIntegrity() {
  console.log('Starting backup integrity test...');

  // 1. Fetch latest backup
  const { data: latestBackup } = await supabase
    .from('backup_logs')
    .select('*')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestBackup) {
    console.error('No completed backups found');
    process.exit(1);
  }

  // 2. Verify backup age
  const backupAge = Date.now() - new Date(latestBackup.created_at).getTime();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  if (backupAge > maxAge) {
    console.error(`Backup too old: ${backupAge / 1000 / 60 / 60} hours`);
    process.exit(1);
  }

  // 3. Verify file size
  if (latestBackup.file_size_bytes < 100) {
    console.error('Backup file too small');
    process.exit(1);
  }

  // 4. Verify record counts
  const recordCounts = latestBackup.records_count;
  if (!recordCounts || Object.keys(recordCounts).length === 0) {
    console.error('No record counts in backup');
    process.exit(1);
  }

  console.log('Backup integrity test PASSED');
  console.log(`Backup created: ${latestBackup.created_at}`);
  console.log(`File size: ${latestBackup.file_size_bytes} bytes`);
}
```

### GitHub Actions Workflow

```yaml
# .github/workflows/backup-test.yml
name: Backup Testing

on:
  schedule:
    - cron: '0 1 * * 0'  # Weekly on Sunday at 1 AM UTC
  workflow_dispatch:

jobs:
  test-backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run backup creation test
        run: npx tsx scripts/backup-test.ts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          TEST_USER_ID: ${{ secrets.TEST_USER_ID }}

      - name: Run backup integrity test
        run: npx tsx scripts/backup-integrity-test.ts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Backup test FAILED",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Backup Test Failed*\nRun: ${{ github.run_id }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## Manual Testing Procedures

### Test 1: Single User Data Restoration

**Frequency:** Weekly
**Duration:** 1 hour
**Prerequisites:**
- Test user account with known data
- Access to Supabase dashboard
- Access to backup-user-data function

#### Procedure

1. **Create Baseline Backup**
   ```bash
   curl -X POST \
     "${SUPABASE_URL}/functions/v1/backup-user-data" \
     -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
     -H "Content-Type: application/json" \
     -d '{"backupType": "export"}'
   ```

2. **Record Current State**
   - Count of kids: ____
   - Count of foods: ____
   - Count of recipes: ____
   - Count of plan entries: ____

3. **Simulate Data Loss**
   (In test environment only)
   ```sql
   -- Delete test user's foods (example)
   DELETE FROM foods WHERE user_id = 'test-user-id';
   ```

4. **Restore From Backup**
   ```bash
   # Decode backup data
   echo "${BACKUP_DATA}" | base64 -d > backup.json

   # Parse and insert data
   node scripts/restore-user-data.js backup.json
   ```

5. **Verify Restoration**
   - Compare counts to baseline
   - Verify relationships intact
   - Check data integrity

6. **Document Results**
   - Time to restore: ____ minutes
   - Data accuracy: ____%
   - Issues encountered: ____

---

### Test 2: Database Point-in-Time Recovery

**Frequency:** Monthly
**Duration:** 2-4 hours
**Prerequisites:**
- Supabase Pro plan (PITR enabled)
- Database admin access
- Test environment available

#### Procedure

1. **Create Test Data**
   ```sql
   -- Insert marker record with timestamp
   INSERT INTO test_recovery (
     marker,
     created_at
   ) VALUES (
     'RECOVERY_TEST_' || NOW()::text,
     NOW()
   );
   ```

2. **Record Recovery Point**
   ```
   Recovery point timestamp: ____________
   Marker value: ____________
   ```

3. **Wait 5 Minutes**
   (Allow for additional operations)

4. **Request PITR** (via Supabase Support)
   - Log into Supabase dashboard
   - Navigate to Project → Support
   - Request PITR to recorded timestamp
   - Note ticket number: ____

5. **Verify Recovery**
   - Check marker record exists
   - Verify no post-recovery data present
   - Confirm database integrity

6. **Document Results**
   - Time from request to completion: ____ hours
   - Data accuracy: ____%
   - Issues: ____

---

### Test 3: Edge Function Recovery

**Frequency:** Monthly
**Duration:** 1 hour
**Prerequisites:**
- Supabase CLI installed
- Function source code available

#### Procedure

1. **List Current Functions**
   ```bash
   supabase functions list > functions_before.txt
   ```

2. **Simulate Function Failure**
   (Do not deploy broken code in production)
   ```bash
   # In test environment
   supabase functions delete test-function
   ```

3. **Recover Function**
   ```bash
   supabase functions deploy test-function
   ```

4. **Verify Function**
   ```bash
   # Test invocation
   supabase functions invoke test-function --body '{}'
   ```

5. **Compare Function List**
   ```bash
   supabase functions list > functions_after.txt
   diff functions_before.txt functions_after.txt
   ```

---

### Test 4: Full Disaster Recovery Drill

**Frequency:** Quarterly
**Duration:** 8 hours (full day)
**Participants:** Full engineering team

#### Pre-Drill Preparation (2 hours before)

1. [ ] Notify all stakeholders
2. [ ] Prepare test environment
3. [ ] Export current production state
4. [ ] Assign roles:
   - Incident Commander: ____
   - Technical Lead: ____
   - Communications: ____

#### Drill Execution

**Phase 1: Simulate Disaster (30 min)**
- Scenario: Complete database corruption
- Actions:
  1. Declare incident
  2. Activate communication channels
  3. Begin status page updates

**Phase 2: Assessment (30 min)**
- Determine scope of damage
- Identify recovery point
- Select recovery strategy

**Phase 3: Recovery (2-4 hours)**
1. Database restoration
2. Edge function redeployment
3. Configuration verification
4. Third-party reconnection

**Phase 4: Verification (1-2 hours)**
- [ ] Authentication working
- [ ] Core CRUD operations
- [ ] Payment processing
- [ ] Real-time features
- [ ] Mobile app connectivity

**Phase 5: Documentation (1 hour)**
- Record timeline
- Document issues
- Capture lessons learned

---

## Verification Checklists

### Data Integrity Verification

```markdown
## Data Integrity Checklist

### User Data
- [ ] Profile information complete
- [ ] Email addresses accurate
- [ ] Preferences preserved

### Kids Data
- [ ] All kids present
- [ ] Allergen data intact
- [ ] Profile pictures linked

### Foods Data
- [ ] Food items present
- [ ] Nutrition info preserved
- [ ] Safe/try-bite flags correct
- [ ] Allergen tags intact

### Recipes
- [ ] Recipe content complete
- [ ] Ingredients linked
- [ ] Instructions preserved

### Meal Plans
- [ ] Plan entries present
- [ ] Dates correct
- [ ] Food references valid

### Relationships
- [ ] User → Kids relationship
- [ ] Kids → Foods relationship
- [ ] Plan entries → Foods relationship
```

### Functional Verification

```markdown
## Functional Verification Checklist

### Authentication
- [ ] User can sign in
- [ ] Session persists
- [ ] Password reset works

### Core Features
- [ ] Add/edit/delete foods
- [ ] Create/modify meal plans
- [ ] Generate grocery list
- [ ] AI suggestions work

### Integrations
- [ ] Stripe payments process
- [ ] Emails send successfully
- [ ] Push notifications work
```

---

## Test Results Documentation

### Test Result Template

```markdown
# Backup Restoration Test Report

## Test Information
- **Test Type:** [Weekly/Monthly/Quarterly]
- **Date:** YYYY-MM-DD
- **Tester:** [Name]
- **Environment:** [Test/Staging/Production]

## Test Scenario
[Description of what was tested]

## Execution Steps
1. Step 1
2. Step 2
3. ...

## Results

### Metrics
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Recovery Time | < 1 hour | 45 min | PASS |
| Data Accuracy | 100% | 100% | PASS |
| Downtime | < 15 min | 10 min | PASS |

### Issues Encountered
1. Issue 1: [Description and resolution]
2. Issue 2: [Description and resolution]

### Data Verification
- Records before: X
- Records after: X
- Difference: 0

## Recommendations
1. Recommendation 1
2. Recommendation 2

## Sign-Off
- Tester: [Signature/Name]
- Reviewer: [Signature/Name]
- Date: YYYY-MM-DD
```

### Historical Test Log

| Date | Type | Result | RTO | Notes |
|------|------|--------|-----|-------|
| 2025-12-04 | Initial | N/A | N/A | Document created |
| YYYY-MM-DD | Weekly | PASS/FAIL | X min | Notes |

---

## Troubleshooting

### Common Issues

#### Backup Creation Fails

**Symptom:** `backup-user-data` returns error

**Checks:**
1. Verify user exists and is authenticated
2. Check backup_config table for user
3. Verify database connectivity
4. Check Edge Function logs

```bash
supabase functions logs backup-user-data
```

#### Backup Data Corrupted

**Symptom:** Restored data is incomplete or malformed

**Checks:**
1. Verify backup file is complete (check file size)
2. Validate JSON structure
3. Check for encoding issues

```bash
# Validate JSON
cat backup.json | jq . > /dev/null && echo "Valid JSON"
```

#### PITR Restore Fails

**Symptom:** Supabase PITR doesn't complete

**Checks:**
1. Verify timestamp is within retention window
2. Confirm correct project selected
3. Contact Supabase support

#### Function Recovery Fails

**Symptom:** Edge Function doesn't deploy

**Checks:**
1. Verify source code is valid TypeScript
2. Check for missing dependencies
3. Review deployment logs

```bash
supabase functions deploy function-name --debug
```

---

## Appendices

### Appendix A: Test User Setup

```sql
-- Create dedicated test user for backup testing
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at
) VALUES (
  'test-backup-user-uuid',
  'backup-test@example.com',
  crypt('test-password', gen_salt('bf')),
  NOW()
);

-- Add test data
INSERT INTO kids (user_id, name, age) VALUES
  ('test-backup-user-uuid', 'Test Child 1', 5),
  ('test-backup-user-uuid', 'Test Child 2', 8);

INSERT INTO foods (user_id, name, category, is_safe) VALUES
  ('test-backup-user-uuid', 'Test Apple', 'fruit', true),
  ('test-backup-user-uuid', 'Test Carrot', 'vegetable', true);
```

### Appendix B: Restoration Scripts

**Location:** `scripts/restore-user-data.js`

```javascript
// scripts/restore-user-data.js
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function restoreUserData(backupFile) {
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
  const userId = backup.metadata.user_id;

  console.log(`Restoring data for user: ${userId}`);

  // Restore in order (respecting foreign keys)
  const tables = ['kids', 'foods', 'recipes', 'plan_entries', 'grocery_items'];

  for (const table of tables) {
    if (backup.data[table]) {
      console.log(`Restoring ${table}: ${backup.data[table].length} records`);

      const { error } = await supabase
        .from(table)
        .upsert(backup.data[table], { onConflict: 'id' });

      if (error) {
        console.error(`Error restoring ${table}:`, error);
      }
    }
  }

  console.log('Restoration complete');
}

restoreUserData(process.argv[2]);
```

### Appendix C: Monitoring Alerts

**Slack Alert Configuration:**

```yaml
# Alert when backup is older than 24 hours
- name: stale_backup
  condition: backup_age > 24h
  severity: warning
  channel: #ops-alerts

# Alert when backup fails
- name: backup_failure
  condition: backup_status == 'failed'
  severity: critical
  channel: #ops-alerts
  page: true
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-04 | Development Team | Initial version |

**Review Schedule:** Monthly
**Next Review:** January 2026
**Document Owner:** DevOps Lead
