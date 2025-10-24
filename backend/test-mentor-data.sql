-- Fix mentor 18 categories - Remove extra categories and keep only the correct ones

-- First, check current categories
SELECT 'Current categories for mentor 18:' as info;
SELECT c.id, c.name, c.slug
FROM mentor_categories mc
JOIN categories c ON mc.category_id = c.id
WHERE mc.mentor_id = 18
ORDER BY c.name;

-- Clear ALL categories for mentor 18
DELETE FROM mentor_categories WHERE mentor_id = 18;

-- Insert only the correct categories (Life Coaching, Career Transition, Grief & Loss)
INSERT INTO mentor_categories (mentor_id, category_id)
SELECT 18, id FROM categories WHERE slug IN ('life-coaching', 'career-transition', 'grief-loss');

-- Verify the fix
SELECT 'Fixed categories for mentor 18:' as info;
SELECT c.name, c.slug
FROM mentor_categories mc
JOIN categories c ON mc.category_id = c.id
WHERE mc.mentor_id = 18
ORDER BY c.name;