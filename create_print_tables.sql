-- ==============================================================================
-- FASHION FEET POS: RELIABLE DEDICATED PRINT QUEUE & PC TERMINALS TABLES
-- Run this in Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================================

-- 1. Create print_jobs table
CREATE TABLE IF NOT EXISTS public.print_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
    invoice_no INTEGER,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'printing', 'printed', 'failed', 'cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    printer_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_at TIMESTAMPTZ,
    printed_at TIMESTAMPTZ
);

-- Fast indexes for polling and filtering
CREATE INDEX IF NOT EXISTS idx_print_jobs_poll ON public.print_jobs (location_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_print_jobs_sale ON public.print_jobs (sale_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_created_at ON public.print_jobs (created_at DESC);

-- Enable RLS & full access policy for anon + authenticated
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'print_jobs' AND policyname = 'Allow public all access on print_jobs'
    ) THEN
        CREATE POLICY "Allow public all access on print_jobs"
            ON public.print_jobs
            FOR ALL
            TO anon, authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- Enable Realtime publication on print_jobs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'print_jobs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
    END IF;
END $$;


-- 2. Create pc_terminals table for Online / Offline Status
CREATE TABLE IF NOT EXISTS public.pc_terminals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    terminal_name TEXT NOT NULL,
    printer_name TEXT,
    paper_size TEXT DEFAULT '58mm',
    is_online BOOLEAN NOT NULL DEFAULT true,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_pc_location_terminal UNIQUE (location_id, terminal_name)
);

ALTER TABLE public.pc_terminals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'pc_terminals' AND policyname = 'Allow public all access on pc_terminals'
    ) THEN
        CREATE POLICY "Allow public all access on pc_terminals"
            ON public.pc_terminals
            FOR ALL
            TO anon, authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'pc_terminals'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.pc_terminals;
    END IF;
END $$;
