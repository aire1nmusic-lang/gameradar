# Robokassa test mode — integration boundary

The private API creates **test-only** orders for an exact nominal price of 50 ₽ per GS Coin. No discount packages or real-sales mode exist. `ENABLE_TEST_PAYMENTS=1` is an explicit switch; absent or incomplete test merchant/fiscal settings yield HTTP 503. Do not set it on the public deployment until the callback URL, fiscal fields, and operational reconciliation are reviewed.

Required private API environment values (do not commit their values):

| Variable | Meaning |
| --- | --- |
| `ROBOKASSA_TEST_LOGIN` | Merchant login from the test shop |
| `ROBOKASSA_TEST_PASSWORD_1` | Test signing password for checkout |
| `ROBOKASSA_TEST_PASSWORD_2` | Separate test signing password for ResultURL |
| `ROBOKASSA_RECEIPT_SNO` | Merchant-approved tax regime |
| `ROBOKASSA_RECEIPT_TAX` | Merchant-approved VAT code |
| `ROBOKASSA_RECEIPT_PAYMENT_OBJECT` | Merchant-approved item category |
| `ROBOKASSA_RECEIPT_PAYMENT_METHOD` | Merchant-approved payment method |
| `ROBOKASSA_RECEIPT_ITEM_NAME` | Merchant-approved name for the receipt item |
| `ENABLE_TEST_PAYMENTS` | Exactly `1` to expose the test order/ResultURL flow |

`POST /api/v1/payments/test/orders` requires a verified session and idempotency key. Its response provides a POST form for `https://auth.robokassa.ru/Merchant/Index.aspx`, always with `IsTest=1`, `Receipt`, buyer email and signed `Shp_order`. The browser success page has no authority over balance. Configure Robokassa's **test ResultURL** as a POST to `/api/v1/payments/robokassa/result`. That route alone accepts form data without browser Origin; it validates test Password #2 signature, invoice, nonce and exact amount. A PostgreSQL transaction then credits one `PURCHASE` ledger entry, balance and order status. Duplicate callbacks return the same `OK{InvId}` without a second credit.

`GET /api/v1/admin/payments/reconciliation` requires `payments.read` and reports stale pending orders, paid/ledger mismatches and balance/ledger mismatches. Investigate mismatches before further payments; correct balances with a new auditable ledger entry, never a ledger edit. A deployment runbook must also compare Robokassa's merchant-side operation records to these orders. The current code does not call Robokassa's reconciliation API; provider credentials and access are absent.

Current live state (30.09.2026): the private Yandex VM has applied all 21 PostgreSQL migrations, including 005, but its `.env` has no `ROBOKASSA_TEST_*` or `ROBOKASSA_RECEIPT_*` names. `ENABLE_TEST_PAYMENTS` is present; the switch alone does not make checkout available without a valid test merchant/fiscal configuration. The live ADMIN reconciliation was checked only with an empty order/ledger result. No ResultURL acceptance, real purchase or provider-side refund has been observed.

`REFUND` now has an implemented [Support correction](support-refunds.md), deployed on the existing VM with migration 21: an ADMIN can cancel one Support entry and return its Coins to the original user through an append-only ledger and outbox. This is **not a provider refund of rubles**; invariants passed locally, no nonempty live correction has been performed. `AVATAR` and `LINK_SLOT` remain schema kinds only, with product operations deferred as SHOULD HAVE in the roadmap. Do not create a manual `REFUND` entry as evidence that Robokassa has returned money. Define the exact entitlement, price, provider refund operation and reconciliation before enabling those flows.

Rollback: disable `ENABLE_TEST_PAYMENTS`, stop new test checkouts, preserve migration 005 and all orders/ledger entries for reconciliation. Do not delete credited test Coins or rewrite a ledger row. A future schema or checkout change needs a verified backup and a separate rollback plan; migration 005 is already present on the existing VM.

Official references checked 27.09.2026: [test mode](https://docs.robokassa.ru/ru/testing-mode), [payment form and signature](https://docs.robokassa.ru/ru/pay-interface), [ResultURL](https://docs.robokassa.ru/ru/notifications-and-redirects), [Receipt](https://docs.robokassa.ru/ru/fiscalization). Fiscal values are merchant-specific; code validates syntax, not legal correctness. Real sales need approved package/minimum-check rules, a verified fiscal scenario and explicit approval.
