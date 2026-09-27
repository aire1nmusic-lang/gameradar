-- Additive PUBLIC-only data. No users, owner ids, evidence, IPs or secrets.
CREATE TABLE public_server_projection (
 server_id TEXT PRIMARY KEY REFERENCES servers(id),
 version INTEGER NOT NULL CHECK(version>0),
 claimed INTEGER NOT NULL CHECK(claimed IN (0,1)),
 received_at TEXT NOT NULL
);
