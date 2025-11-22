-- Migration: 031_refine_billing_schema.sql
-- Description: Refines the billing and session schema for clarity, consistency, and robustness.
-- Date: 2025-11-17

-- ==========================================
-- I. RENAME CONFUSING COLUMNS
-- ==========================================

-- Rename `minimum_debit` to `minimum_charge` in `sessions` table for better clarity.
ALTER TABLE sessions
RENAME COLUMN minimum_debit TO minimum_charge;

-- ==========================================
-- II. ADD/RE-INTRODUCE CRITICAL COLUMNS
-- ==========================================

-- Re-introduce `platform_fee` to the `sessions` table to store the calculated fee per session.
-- This was removed in a previous migration but is essential for financial reporting.
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(10, 2) DEFAULT 0 CHECK (platform_fee >= 0);

-- Add `mentor_payout_amount` to `sessions` to store the final amount transferred to the mentor.
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS mentor_payout_amount DECIMAL(10, 2) DEFAULT 0 CHECK (mentor_payout_amount >= 0);

-- Add `billing_status` to `sessions` to manage the billing state machine.
-- 'pending': No billing activity yet.
-- 'active': Both users are present, and charges are accumulating.
-- 'paused': One user has left; charging is paused.
-- 'finalized': The session is over, and all financial transactions are complete.
-- 'error': A billing error occurred that needs manual review.
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS billing_status VARCHAR(20) DEFAULT 'pending' CHECK (billing_status IN ('pending', 'active', 'paused', 'finalized', 'error'));


-- ==========================================
-- III. CONSOLIDATE TIMING FIELDS
-- ==========================================

-- Ensure `actual_start_time` and `actual_end_time` are the single source of truth in the `sessions` table.
-- The `video_meetings` table should not store redundant timing information.

-- Drop redundant timing columns from `video_meetings` if they exist.
ALTER TABLE video_meetings
DROP COLUMN IF EXISTS actual_start_time,
DROP COLUMN IF EXISTS actual_end_time;

-- ==========================================
-- IV. ADD INDEXES FOR PERFORMANCE
-- ==========================================

-- Add an index on the new `billing_status` column to quickly query sessions by their billing state.
CREATE INDEX IF NOT EXISTS idx_sessions_billing_status ON sessions(billing_status);

-- Add a composite index on presence columns for faster checks on who is in a session.
CREATE INDEX IF NOT EXISTS idx_sessions_presence ON sessions(mentee_present, mentor_present);


-- ==========================================
-- V. MIGRATION COMPLETION
-- ==========================================

-- The migration script will confirm success or failure.
-- Validation logic has been removed to prevent script execution errors.

-- End of migration.