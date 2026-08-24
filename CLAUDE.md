# Backend Project Rules

## API Response Format

All API responses must follow this JSON structure:

```json
// Success
{
  "data": {},
  "metadata": { "page": 1, "limit": 20, "total": 100 }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": []
  }
}
```

- List endpoints always include `metadata` with pagination info
- Single resource endpoints return `data` without `metadata.page/limit/total`
- Error responses omit `data` and return `error` object

## Logging

- Use a logging interceptor that logs every incoming request at DEBUG level
- Log: method, path, status code, duration, request ID
- Do NOT log sensitive fields (passwords, tokens, PII)

## Status Codes

Use precise HTTP status codes — avoid falling through to 500:

| Code | When                                    |
| ---- | --------------------------------------- |
| 200  | Success                                 |
| 201  | Resource created                        |
| 204  | Success, no body (delete)               |
| 400  | Bad request / validation failure        |
| 401  | Unauthenticated                         |
| 403  | Forbidden                               |
| 404  | Resource not found                      |
| 409  | Conflict (duplicate, state violation)   |
| 422  | Unprocessable entity                    |
| 500  | Only for truly unexpected server errors |

Catch known failure modes explicitly and return the correct 4xx code.

## Naming Convention (RESTful)

- Resources are **plural nouns**: `/users`, `/orders`, `/products`
- Nested resources: `/users/:userId/orders`
- Use kebab-case for multi-word paths: `/order-items`
- Use camelCase for JSON field names
- No verbs in URLs — use HTTP methods: `POST /users` not `POST /createUser`
- Filter/sort via query params: `GET /users?status=active&sort=createdAt`

## Request Validation

- Validate all incoming request bodies, query params, and path params at the controller layer
- Use DTO / schema validation (class-validator, zod, joi, etc.)
- Return 400 with descriptive error details on validation failure
- Never trust client input — sanitize before use

## Layer Separation

```
Controller → Service → Repository → Database
```

- **Controller**: HTTP concerns only — parse request, validate input, call service, return response
- **Service**: Business logic, orchestration, transactions — no HTTP objects
- **Repository**: Data access only — queries, mutations — no business logic
- Do NOT skip layers (controller must not call repository directly)

## Database

### Indexing

- Add indexes on columns used in WHERE, JOIN, ORDER BY
- Add composite indexes for frequent multi-column queries
- Review query plans for new queries

### N+1 Prevention

- Use eager loading / joins for related data fetched in loops
- Never query inside a loop — batch or join instead
- Use dataloader pattern for GraphQL if applicable

### Pagination

- All list endpoints MUST support pagination
- Default: `page=1`, `limit=20`
- Return `total` count in metadata
- Cap maximum `limit` (e.g., 100)

## Caching

- Cache expensive or frequently-read data (config, lookups, computed aggregations)
- Set appropriate TTL — do not cache indefinitely
- Invalidate cache on write operations that affect cached data
- Use cache-aside pattern: check cache → miss → query DB → populate cache
