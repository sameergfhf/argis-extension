-- Migration: backfill assessment coverage / points on existing Supabase scan rows.
--
-- Until now sync_scan_to_supabase() omitted earned_points, assessed_points and
-- assessment_coverage from public.scans.metadata, while the frontend history
-- reads coverage from exactly that field. Rows written (or last overwritten) by
-- the backend therefore show a blank coverage in the UI.
--
-- The full result document is stored as metadata.result_json (a JSON string) and
-- already contains the computed `score` block, so we can recover the values from
-- there without re-running any scans.
--
-- Idempotent: only rows still missing assessment_coverage are touched.
-- Run in the Supabase SQL editor (service_role) against the project database.

begin;

with recoverable as (
  select
    s.id,
    case
      -- CASE guarantees the cast is only attempted on object-shaped JSON.
      when s.metadata->>'result_json' ~ '(?s)^\s*\{.*\}\s*$'
        then (s.metadata->>'result_json')::jsonb
    end as payload
  from public.scans s
  where s.metadata is not null
    and s.metadata->>'assessment_coverage' is null
    and s.metadata->>'result_json' is not null
)
update public.scans s
set metadata = s.metadata || jsonb_strip_nulls(
  jsonb_build_object(
    'earned_points',       r.payload #> '{score,earned_points}',
    'assessed_points',     r.payload #> '{score,assessed_points}',
    'assessment_coverage', r.payload #> '{score,assessment_coverage}'
  )
)
from recoverable r
where s.id = r.id
  and r.payload #> '{score,assessment_coverage}' is not null;

commit;

-- Verify: list rows that still have no coverage (expected: failed/pending scans,
-- and scans whose metadata never contained result_json).
--
-- select id, status, started_at
-- from public.scans
-- where metadata is null or metadata->>'assessment_coverage' is null
-- order by started_at desc;
