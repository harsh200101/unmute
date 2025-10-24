-- Update user name from "Manswi Sahare" to "Mentor Profile"
UPDATE users
SET first_name = 'Mentor', last_name = 'Profile', updated_at = CURRENT_TIMESTAMP
WHERE first_name = 'Manswi' AND last_name = 'Sahare';