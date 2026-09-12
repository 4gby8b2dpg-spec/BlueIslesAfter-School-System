-- =====================================================================
-- 0018 — let retention purge (FR-I.4) actually delete participants who
-- have a survey response.
--
-- survey_responses.respondent_participant_id referenced participants(id)
-- with no ON DELETE clause (default NO ACTION), so runRetentionPurge's
-- delete would fail with a FK violation for any purge-eligible participant
-- who'd ever answered a survey — silently, since the caller swallows the
-- error. Answers themselves are kept for aggregate reporting; only the
-- link to the now-erased participant is cleared.
-- =====================================================================

alter table survey_responses
  drop constraint survey_responses_respondent_participant_id_fkey,
  add constraint survey_responses_respondent_participant_id_fkey
    foreign key (respondent_participant_id) references participants(id)
    on delete set null;
