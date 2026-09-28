ALTER TABLE gs_votes ADD COLUMN review_status text NOT NULL DEFAULT 'ACCEPTED'
  CHECK(review_status IN ('ACCEPTED','VOIDED'));
ALTER TABLE gs_votes ADD COLUMN reviewed_by text REFERENCES gs_users(id);
ALTER TABLE gs_votes ADD COLUMN review_reason text;
ALTER TABLE gs_votes ADD COLUMN reviewed_at timestamptz;
CREATE INDEX ON gs_votes(server_id,created_at DESC) WHERE review_status='ACCEPTED';
INSERT INTO gs_role_permissions(role,permission) VALUES
  ('ADMIN','votes.manage'),('MODERATOR','votes.manage');
