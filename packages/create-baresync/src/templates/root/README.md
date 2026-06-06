# __PROJECT_NAME__

Generated with `create-baresync`.

## Commands

- `__PACKAGE_MANAGER__ run check`
- `__PACKAGE_MANAGER__ run fix`
- `__PACKAGE_MANAGER__ run generate:sync`
- `__PACKAGE_MANAGER__ run migrate:local`
- `__PACKAGE_MANAGER__ run migrate:server`
- `__PACKAGE_MANAGER__ run dev`

## Auth and request headers

Sync requests are unauthenticated by default. If your server requires auth:

- **JS side** — Call `syncClient.setHeaders({ Authorization: 'Bearer ...' })` before starting polling, and again whenever the token refreshes. Pass `{}` to clear.
- **Server side** — Read headers from the `Request` object inside your `resolveScope` function and reject unauthorised callers before processing sync data.

Headers are plugin-wide (not per-scope) and are not required for local development.
