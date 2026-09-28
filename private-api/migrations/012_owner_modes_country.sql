-- Extend reviewed facts without changing prior decisions or approved values.
ALTER TABLE gs_owner_fact_edits DROP CONSTRAINT gs_owner_fact_edits_field_check;
ALTER TABLE gs_owner_fact_edits ADD CONSTRAINT gs_owner_fact_edits_field_check
 CHECK(field IN ('version','rates','region','openedAt','modes','country'));
