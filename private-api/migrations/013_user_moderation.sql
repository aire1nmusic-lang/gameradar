-- Only ADMIN may suspend an account; financial and vote history is retained.
INSERT INTO gs_role_permissions(role,permission) VALUES ('ADMIN','users.manage');
