ALTER TABLE gs_copyright_claims DROP CONSTRAINT gs_copyright_claims_material_key_check;
ALTER TABLE gs_copyright_claims ADD CONSTRAINT gs_copyright_claims_material_key_check
  CHECK(material_key IN ('site','discord','telegram','description'));
ALTER TABLE gs_material_restrictions DROP CONSTRAINT gs_material_restrictions_material_key_check;
ALTER TABLE gs_material_restrictions ADD CONSTRAINT gs_material_restrictions_material_key_check
  CHECK(material_key IN ('site','discord','telegram','description'));
