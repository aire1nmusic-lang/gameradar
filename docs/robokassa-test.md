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

Rollback: disable `ENABLE_TEST_PAYMENTS`, stop new test checkouts, preserve migration 005 and all orders/ledger entries for reconciliation. Do not delete credited test Coins or rewrite a ledger row. A live migration needs a backup and a separate rollback plan. This local migration is additive and has not run in production.

Official references checked 27.09.2026: [test mode](https://docs.robokassa.ru/ru/testing-mode), [payment form and signature](https://docs.robokassa.ru/ru/pay-interface), [ResultURL](https://docs.robokassa.ru/ru/notifications-and-redirects), [Receipt](https://docs.robokassa.ru/ru/fiscalization). Fiscal values are merchant-specific; code validates syntax, not legal correctness. Real sales need approved package/minimum-check rules, a verified fiscal scenario and explicit approval.
