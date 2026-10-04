-- Old sessions remain unknown: linked identities cannot prove how a session started.
ALTER TABLE gs_sessions ADD COLUMN login_method text
  CHECK (login_method IN ('email','google','discord','vk','yandex'));
-- Rollback: run the previous API; the nullable column is harmless. Do not drop live sessions.
