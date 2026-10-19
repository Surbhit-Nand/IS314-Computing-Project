-- PREPARED ONLY: destructive cleanup requires separate user approval.
-- No CASCADE: unexpected dependencies must stop the migration.
-- This single DO statement is atomic even if invoked through the HTTP runner.
DO $cleanup$
DECLARE
  assessment_count bigint;
  approved_count text;
BEGIN
  IF current_setting('ara.approve_rapid_triage_removal', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Rapid Triage cleanup is not approved. Review/export existing assessments before separately authorizing removal.';
  END IF;
  LOCK TABLE public.veterinary_triage_assessments IN ACCESS EXCLUSIVE MODE;
  SELECT count(*) INTO assessment_count FROM public.veterinary_triage_assessments;
  approved_count := current_setting('ara.approved_rapid_triage_row_count', true);
  IF approved_count IS NULL OR approved_count !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Explicit approval of the exact assessment row count is required';
  END IF;
  IF assessment_count <> approved_count::bigint THEN
    RAISE EXCEPTION 'Assessment count changed: found %, approved %. Stop and review.', assessment_count, approved_count;
  END IF;
  DROP TABLE public.veterinary_triage_assessments RESTRICT;
  DROP TYPE public.triage_clinical_stability RESTRICT;
  DROP TYPE public.triage_intervention_urgency RESTRICT;
  DROP TYPE public.triage_condition_trend RESTRICT;
  DROP TYPE public.triage_emergency_finding RESTRICT;
END
$cleanup$;
