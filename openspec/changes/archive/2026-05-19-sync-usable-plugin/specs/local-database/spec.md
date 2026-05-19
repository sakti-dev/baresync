## MODIFIED Requirements

### Requirement: Client identity persistence table

The local database SHALL include a `sync_client_identity` table for persisting a stable device-level client ID:

```sql
CREATE TABLE IF NOT EXISTS sync_client_identity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);
```

This table SHALL be created during database initialization or migration.

#### Scenario: Table created on first connect

- **WHEN** the database is initialized and `sync_client_identity` does not exist
- **THEN** the table SHALL be created

#### Scenario: Client ID generated on first access

- **WHEN** no row exists in `sync_client_identity`
- **THEN** a new UUID v4 SHALL be generated, inserted, and returned

#### Scenario: Client ID reused on subsequent access

- **WHEN** a row exists in `sync_client_identity`
- **THEN** the existing `client_id` SHALL be returned without generating a new one
