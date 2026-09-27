CREATE TABLE gs_roles (
 name text PRIMARY KEY CHECK(name IN ('ADMIN','MODERATOR','FINANCE','COPYRIGHT','SUPPORT'))
);
CREATE TABLE gs_role_permissions (
 role text NOT NULL REFERENCES gs_roles(name), permission text NOT NULL,
 PRIMARY KEY(role,permission)
);
CREATE TABLE gs_user_roles (
 user_id text NOT NULL REFERENCES gs_users(id), role text NOT NULL REFERENCES gs_roles(name),
 granted_by text REFERENCES gs_users(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,role)
);
INSERT INTO gs_roles(name) VALUES ('ADMIN'),('MODERATOR'),('FINANCE'),('COPYRIGHT'),('SUPPORT');
INSERT INTO gs_role_permissions(role,permission) VALUES
 ('ADMIN','roles.manage'),('ADMIN','users.read'),('ADMIN','servers.read'),
 ('ADMIN','claims.review'),('ADMIN','votes.read'),('ADMIN','support.read'),
 ('ADMIN','coins.read'),('ADMIN','payments.read'),('ADMIN','moderation.manage'),
 ('ADMIN','copyright.read'),('ADMIN','copyright.review'),('ADMIN','system.read'),
 ('MODERATOR','servers.read'),('MODERATOR','claims.review'),('MODERATOR','votes.read'),
 ('MODERATOR','support.read'),('MODERATOR','moderation.manage'),
 ('FINANCE','coins.read'),('FINANCE','payments.read'),('FINANCE','support.read'),
 ('COPYRIGHT','copyright.read'),('COPYRIGHT','copyright.review'),('COPYRIGHT','servers.read'),
 ('SUPPORT','users.read'),('SUPPORT','servers.read'),('SUPPORT','claims.review'),('SUPPORT','system.read');
