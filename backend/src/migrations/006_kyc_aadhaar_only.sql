-- Simplified KYC: Aadhaar alone is sufficient identity proof. Admin still
-- approves. PAN + bank fields stay on the table but become optional, so
-- mentors can add them later (needed before the first withdrawal).

ALTER TABLE mentor_kyc
  ADD COLUMN IF NOT EXISTS aadhaar_number TEXT;

-- All previously-required ID/bank columns are now optional.
ALTER TABLE mentor_kyc ALTER COLUMN pan_number           DROP NOT NULL;
ALTER TABLE mentor_kyc ALTER COLUMN full_name_as_per_pan DROP NOT NULL;
ALTER TABLE mentor_kyc ALTER COLUMN bank_account_number  DROP NOT NULL;
ALTER TABLE mentor_kyc ALTER COLUMN bank_ifsc            DROP NOT NULL;
ALTER TABLE mentor_kyc ALTER COLUMN bank_account_holder  DROP NOT NULL;

-- Aadhaar must be 12 digits when present. NULL allowed only on legacy rows
-- that pre-date this migration; new submissions are validated in the service.
ALTER TABLE mentor_kyc DROP CONSTRAINT IF EXISTS mentor_kyc_aadhaar_check;
ALTER TABLE mentor_kyc ADD CONSTRAINT mentor_kyc_aadhaar_check
  CHECK (aadhaar_number IS NULL OR aadhaar_number ~ '^[0-9]{12}$');
