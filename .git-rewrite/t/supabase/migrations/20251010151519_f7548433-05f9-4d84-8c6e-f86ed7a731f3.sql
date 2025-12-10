-- Add 'webhook' to social_platform enum
ALTER TYPE social_platform ADD VALUE IF NOT EXISTS 'webhook';

-- Allow null platform for webhook-only accounts
ALTER TABLE social_accounts ALTER COLUMN platform DROP NOT NULL;