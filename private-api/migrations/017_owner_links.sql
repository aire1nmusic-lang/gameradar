-- Reviewed public link changes share the existing owner fact approval and audit flow.
-- An empty value explicitly removes a link; old decisions remain immutable.
ALTER TABLE gs_owner_fact_edits DROP CONSTRAINT gs_owner_fact_edits_field_check;
ALTER TABLE gs_owner_fact_edits ADD CONSTRAINT gs_owner_fact_edits_field_check
  CHECK(field IN ('version','rates','region','openedAt','modes','country','site','discord','telegram'));
ALTER TABLE gs_owner_fact_edits DROP CONSTRAINT gs_owner_fact_edits_value_check;
ALTER TABLE gs_owner_fact_edits ADD CONSTRAINT gs_owner_fact_edits_value_check
  CHECK ((field IN ('site','discord','telegram') AND length(value) BETWEEN 0 AND 500)
    OR (field NOT IN ('site','discord','telegram') AND length(value) BETWEEN 1 AND 80));
