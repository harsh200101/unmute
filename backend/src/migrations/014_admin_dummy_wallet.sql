-- Phase 14: Ensure all admin accounts have verified status, dummy wallet balances, and mentor profiles for complete testing.

-- 1. Ensure known admin emails are assigned admin role and verified email
UPDATE users
SET role = 'admin',
    email_verified_at = COALESCE(email_verified_at, NOW()),
    is_active = TRUE
WHERE email IN ('manswisahare9@gmail.com', 'harshgajbhiye34@gmail.com');

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, NOW()),
    is_active = TRUE
WHERE role = 'admin';

-- 2. Ensure admin users have approved mentor profiles so they can test Go Live & mentoring
INSERT INTO mentor_profiles (user_id, pricing_tier_id, headline, bio, verification_status, verified_at)
SELECT u.id,
       COALESCE((SELECT id FROM pricing_tiers ORDER BY rate_per_minute_paise ASC LIMIT 1), 1),
       'Admin & Philosophical Mentor',
       'Experienced mentor on Unmute (System Administrator / Tester)',
       'approved',
       NOW()
FROM users u
WHERE (u.role = 'admin' OR u.email IN ('manswisahare9@gmail.com', 'harshgajbhiye34@gmail.com'))
  AND NOT EXISTS (SELECT 1 FROM mentor_profiles mp WHERE mp.user_id = u.id);

-- 3. Ensure mentee wallets exist for all admins
INSERT INTO wallets (user_id, kind, balance_paise)
SELECT id, 'mentee', 0
FROM users
WHERE role = 'admin'
ON CONFLICT (user_id, kind) DO NOTHING;

-- 4. Ensure mentor wallets exist for all admins
INSERT INTO wallets (user_id, kind, balance_paise)
SELECT id, 'mentor', 0
FROM users
WHERE role = 'admin'
ON CONFLICT (user_id, kind) DO NOTHING;

-- 5. Credit ₹50,000 dummy money (5,000,000 paise) to all admin mentee wallets via wallet_transactions
-- The trigger trg_wt_apply automatically increments wallets.balance_paise and sets balance_after_paise
INSERT INTO wallet_transactions (wallet_id, direction, amount_paise, balance_after_paise, reason, description, idempotency_key)
SELECT w.id, 'credit', 5000000, 0, 'admin_adjustment', 'Admin testing wallet dummy credit (₹50,000)', 'admin_dummy_credit_' || w.id || '_init'
FROM wallets w
JOIN users u ON u.id = w.user_id
WHERE u.role = 'admin' AND w.kind = 'mentee'
ON CONFLICT (idempotency_key) DO NOTHING;

-- 6. Also credit ₹50,000 dummy money to all admin mentor wallets
INSERT INTO wallet_transactions (wallet_id, direction, amount_paise, balance_after_paise, reason, description, idempotency_key)
SELECT w.id, 'credit', 5000000, 0, 'admin_adjustment', 'Admin testing mentor wallet dummy credit (₹50,000)', 'admin_dummy_mentor_credit_' || w.id || '_init'
FROM wallets w
JOIN users u ON u.id = w.user_id
WHERE u.role = 'admin' AND w.kind = 'mentor'
ON CONFLICT (idempotency_key) DO NOTHING;

-- 7. Ensure platform wallet has funds for testing refunds
UPDATE wallets SET balance_paise = GREATEST(balance_paise, 50000000) WHERE kind = 'platform';
