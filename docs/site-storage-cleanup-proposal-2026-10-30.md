# Site storage cleanup proposal — 30.10.2026

Production deploy 41114164150 (main a8984f8: SEO pages, llms.txt, link previews, community core) stopped at
"Persist and verify durable rollback archive": `BucketMaxSizeExceeded` in bucket `gamescout-ru-site`.
Nothing was uploaded; the live site stays on 9742b53.

Read-only inventory 41116289378 (SUCCESS): 1,633 objects, 1,031,845,112 bytes; 9 complete rollback archives;
1 incomplete multipart (left untouched). The three newest archives were downloaded and SHA-256 verified
(fb158451, 285ea405, 9742b530) and are KEPT.

## Proposed for removal — exactly these 6 objects (550,269,311 bytes)

| Key | Bytes |
| --- | --- |
| `_deployment-backups/b11acee85c43d0b669f0f8f9f496353a5ff8ee6f/40560892229-1/site-rollback.tar.gz` | 90,695,578 |
| `_deployment-backups/1190bd927606aae555380e9525568ac948ad47a1/40651635227-1/site-rollback.tar.gz` | 90,697,313 |
| `_deployment-backups/9436b8f440d74d45577481705676559c8e9ce872/40755901626-1/site-rollback.tar.gz` | 90,642,918 |
| `_deployment-backups/d8e8469f3a93b2b9fd5a2a321f063c40041734f9/40940726424-1/site-rollback.tar.gz` | 92,743,526 |
| `_deployment-backups/de7798e439310e1eba0f56e4ed6a36cee68690a7/41011978360-1/site-rollback.tar.gz` | 92,745,219 |
| `_deployment-backups/14d4efa472762d45ca9d02090a3b0e7c406c2a3a/41019653763-1/site-rollback.tar.gz` | 92,744,757 |

Kept: the 3 newest verified archives (fb158451, 285ea405, 9742b530) — the current live version and two before it.
Expected after removal: about 481.6 MB, room for ~5 more releases.

Deletion is irreversible and is done by the owner (Yandex Cloud console → Object Storage → gamescout-ru-site →
_deployment-backups → the six folders above), not by Claude. Afterwards: re-run the failed production run 41114164150.

Root cause to fix separately: every release adds ~88 MB and nothing rotates old archives, so the 1 GB bucket fills
in about 6 releases. A guarded "keep newest N" rotation (owner-approved once) would stop this from recurring.
