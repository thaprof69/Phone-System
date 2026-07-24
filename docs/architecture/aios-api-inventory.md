# AIOS API Inventory

| Method/path                                       | Purpose                         | Browser               |
| ------------------------------------------------- | ------------------------------- | --------------------- |
| `GET /v1/admin/ai/overview`                       | AIOS overview/readiness/usage   | Authorized admin      |
| `GET /v1/admin/ai/catalogue`                      | Registry read models            | Authorized admin      |
| `POST /v1/admin/ai/readiness/evaluate`            | Recompute AIOS readiness        | Authorized admin      |
| `POST /v1/admin/ai/providers/test`                | Ephemeral credential validation | Authorized admin      |
| `POST /v1/admin/ai/providers/connect`             | Encrypted verified save         | Authorized admin      |
| `POST /v1/admin/ai/providers/:id/discover-models` | Provider model discovery        | Authorized admin      |
| `DELETE /v1/admin/ai/providers/:id`               | Non-destructive disconnect      | Authorized admin      |
| `POST /v1/internal/aios/execute`                  | Gateway execution transport     | Service identity only |

The internal route is not proxied as a browser API and requires server-side authorization.
