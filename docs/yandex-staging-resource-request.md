# Yandex private-core managed-PostgreSQL proposal (rejected; not created)

**Superseded cost proposal.** The user rejected the 4,480.70 ₽/month managed-PostgreSQL option on 28 September 2026. Do not create it under the prior request. See [the free, lower-cost and managed options](yandex-private-hosting-options.md) before proposing another paid resource.

Read-only console inspection on 28 September 2026 found no Managed PostgreSQL cluster, Serverless Container or VPC network in the `gamescout` folder (`b1gee8rjvfqvev92jkcr`). The create form was left unsubmitted. The account dashboard displayed 0 ₽ used and 4,000 ₽ available; the latter is **not** an agreed cost cap or evidence that the cluster is free.

## Rejected first-deployment proposal (historical estimate)

Create a dedicated VPC and subnet in the same Yandex region and availability zone as one **staging-only** Managed PostgreSQL host, with no public database IP. The console's “Test” preset selected PostgreSQL 17, `c4a-c2-m4` (2 vCPU, 4 GB RAM), `network-ssd` 20 GB, PRESTABLE, and seven-day automatic backups. The displayed estimate was **4,480.70 ₽ per 30 days including VAT**, broken into 2,706.05 ₽ CPU, 1,460.74 ₽ RAM and 313.92 ₽ SSD. The form explicitly describes one host as suitable for development and testing, not production. A separate two-host “Standard” preset displayed 11,882.88 ₽ per month. These are console estimates, not invoices or fixed future tariffs. [Official PostgreSQL pricing](https://yandex.cloud/ru/docs/managed-postgresql/pricing).

The create form defaults to **automatic disk growth enabled with a 200 GB maximum**, even though the initial disk is 20 GB. Disable automatic growth or cap it at the approved storage budget before submitting; the 4,480.70 ₽ quote assumes the initial 20 GB. The private API also requires a private Serverless Container, image storage in Container Registry, a one-minute timer, Lockbox or equivalent secret delivery, and a staging API route. Container CPU/RAM/call time, image storage, possible public IP/egress, gateway calls and backup growth are **additional variable charges**. The prior illustrative one-minute timer at 1 GB and 0.5 vCPU, two seconds per invocation, was about 92.89 ₽ per 30 days after free allowances, excluding API traffic. That is not a spending ceiling. [Container pricing](https://yandex.cloud/ru/docs/serverless-containers/pricing), [registry pricing](https://yandex.cloud/ru/docs/container-registry/pricing), [VPC pricing](https://yandex.cloud/ru/docs/vpc/pricing). The container and database must share a private VPC network per the [connection guide](https://yandex.cloud/ru/docs/managed-postgresql/operations/connect/).

**No approval exists for this configuration.** No production DNS, real Robokassa sales, existing gateway cutover or production private migration is part of any staging proposal.

## Deployment and rollback gates

1. Record console price before each create action and enable a Yandex budget alert below the approved cap; alerts are not a hard spending limit. Use private network access and minimal service-account roles. Keep credentials in secret storage.
2. Verify backup and **restore** into a disposable database, then run `db:private-plan` and review its fingerprint. Apply additive staging migrations 001–020 only against this new empty staging database. No existing production private data is migrated or deleted.
3. Build the image and validate private container health, signed projection retry, mail and timer auth, then route a **staging** hostname/path to it. Test the player, owner and admin paths with fixtures and all three games.
4. If staging fails, stop the timer/container and staging route, preserve logs and backup for diagnosis, and delete paid staging resources only after their data and costs have been reviewed. Leave the current production gateway, D1 catalog and DNS untouched. A later production cutover needs its own approved plan with export/reconciliation, backup/restore drill and rollback criteria.

Status: **REJECTED**. Continue local work and prepare the lower-cost VM candidate for separate price review. New cloud spend from this work: **0 ₽**.
