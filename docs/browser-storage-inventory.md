# Browser storage and cookie decision

Status 01.10.2026: technical inventory completed. GameScout does not load third-party analytics scripts and the legacy card-event function has no network or storage side effects.

The only cookies created by the private account flow are strictly functional:

- `gs_private_session`: HttpOnly, Secure in production, SameSite=Lax, up to seven days;
- `gs_private_oauth`: HttpOnly, Secure in production, SameSite=Lax, up to ten minutes, removed after the OAuth callback.

Anonymous GET requests to `/`, `/account`, `/privacy` and `/api/v1/auth/me` return no `Set-Cookie`. The root HTML contains no external script URLs. Browser local storage contains presentation preferences, cached public game structure and favorites. Session storage contains a random per-tab voting device signal; the private API stores only its keyed hash.

Decision for the current product: do not show a consent popup because there is no optional analytics or advertising cookie to accept. The privacy page provides the necessary technical notice. This decision must be reviewed before adding analytics, advertising, fingerprinting, embedded third-party media or another optional browser identifier. Legal applicability still depends on the operator's final documents and is not established by this code inventory.
