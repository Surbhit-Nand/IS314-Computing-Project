# Frontend API clients

These clients call the Express API; business rules belong in backend services.
`animalsApi.ts` sends `{ query }` to `POST /api/animals/ai-search` and returns
ranked IDs for existing animal cards. It does not parse search intent or generate
embeddings. See [backend search documentation](../../server/README.md).
