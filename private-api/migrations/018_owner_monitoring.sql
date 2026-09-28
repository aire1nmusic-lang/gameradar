-- The owner controls only public, token-free endpoints. Private ownership and audit stay here.
CREATE TABLE gs_owner_monitoring_overrides (
 server_id text PRIMARY KEY REFERENCES gs_server_registry(server_id),
 enabled boolean NOT NULL,
 method text CHECK(method IN ('GAME_PROTOCOL','LOGIN_SERVER','SERVER_API')),
 host text,
 port integer CHECK(port BETWEEN 1 AND 65535),
 api_url text,
 updated_by text NOT NULL REFERENCES gs_users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((enabled=false AND method IS NULL AND host IS NULL AND port IS NULL AND api_url IS NULL)
   OR (enabled=true AND method IN ('GAME_PROTOCOL','LOGIN_SERVER') AND host IS NOT NULL AND api_url IS NULL)
   OR (enabled=true AND method='SERVER_API' AND api_url IS NOT NULL AND host IS NULL AND port IS NULL))
);
