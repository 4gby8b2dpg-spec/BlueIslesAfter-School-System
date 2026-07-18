-- =====================================================================
-- 0005 — public (anonymous) survey access via token.
--
-- Anonymous respondents open a published survey by its link and submit
-- answers WITHOUT any direct table access. Two SECURITY DEFINER functions
-- are the only surface exposed to `anon`; each enforces its own token +
-- status check, so RLS stays deny-by-default for anon on the base tables.
-- This avoids leaking the full set of open surveys (and their tokens) that
-- a broad `anon SELECT` policy would allow enumerating.
-- =====================================================================

-- Clean up the earlier permissive-policy design if it was ever applied.
drop policy if exists survey_public_read   on surveys;
drop policy if exists question_public_read  on survey_questions;
drop policy if exists response_public_insert on survey_responses;
drop policy if exists answer_public_insert   on survey_answers;

-- ---------------------------------------------------------------------
-- Read: fetch one open survey + its questions, scoped to the token.
-- Returns null when the token is unknown or the survey isn't open.
-- ---------------------------------------------------------------------
create or replace function public.get_public_survey(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'org_id', s.org_id,
    'title', s.title,
    'description', s.description,
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'prompt', q.prompt,
          'qtype', q.qtype,
          'options', q.options,
          'required', q.required
        ) order by q.position
      )
      from survey_questions q
      where q.survey_id = s.id
    ), '[]'::jsonb)
  )
  from surveys s
  where s.public_token = p_token
    and s.status = 'open'
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- Write: submit a response (+ answers) to an open survey by token.
-- p_answers is a jsonb array of { "question_id": uuid, "value": <any> }.
-- Answers for questions that don't belong to the survey are ignored.
-- ---------------------------------------------------------------------
create or replace function public.submit_survey_response(p_token text, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survey      surveys%rowtype;
  v_response_id uuid;
  v_valid_qids  uuid[];
  v_answer      jsonb;
begin
  select * into v_survey
  from surveys
  where public_token = p_token
    and status = 'open';

  if v_survey.id is null then
    raise exception 'Survey not available';
  end if;

  insert into survey_responses (org_id, survey_id)
  values (v_survey.org_id, v_survey.id)
  returning id into v_response_id;

  select coalesce(array_agg(id), '{}') into v_valid_qids
  from survey_questions
  where survey_id = v_survey.id;

  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    if (v_answer->>'question_id')::uuid = any (v_valid_qids) then
      insert into survey_answers (org_id, response_id, question_id, value)
      values (
        v_survey.org_id,
        v_response_id,
        (v_answer->>'question_id')::uuid,
        v_answer->'value'
      );
    end if;
  end loop;
end;
$$;

-- Only anon (and, by inheritance, authenticated) may call these; the
-- functions themselves gate access by token + status.
revoke all on function public.get_public_survey(text) from public;
revoke all on function public.submit_survey_response(text, jsonb) from public;
grant execute on function public.get_public_survey(text) to anon, authenticated;
grant execute on function public.submit_survey_response(text, jsonb) to anon, authenticated;
