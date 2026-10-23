-- ==============================================================================
-- FASHION FEET / SHOE GALLERY POS: ADD CASH RECEIVED & CHANGE COLUMNS TO SALES
-- Run this in Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================================

-- 1. Add cash_received and change_amount columns to sales table if not already present
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS cash_received NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS change_amount NUMERIC DEFAULT 0;

-- 2. Notify PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
