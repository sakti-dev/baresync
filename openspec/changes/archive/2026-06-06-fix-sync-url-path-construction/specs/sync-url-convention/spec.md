## ADDED Requirements

### Requirement: Client transport URL construction

The client transport SHALL construct endpoint URLs by appending the action name (`/push`, `/status`, `/pull`) directly to the `api_base_url`, without inserting any intermediate path segments.

#### Scenario: Base URL with sync path segment

- **WHEN** `api_base_url` is `"http://192.168.1.2:3001/api/sync/v1"`
- **THEN** the push endpoint is `"http://192.168.1.2:3001/api/sync/v1/push"`
- **AND** the status endpoint is `"http://192.168.1.2:3001/api/sync/v1/status"`
- **AND** the pull endpoint is `"http://192.168.1.2:3001/api/sync/v1/pull"`

#### Scenario: Base URL with trailing slash

- **WHEN** `api_base_url` is `"http://192.168.1.2:3001/api/v1/"`
- **THEN** the push endpoint is `"http://192.168.1.2:3001/api/v1/push"`

#### Scenario: Base URL without path

- **WHEN** `api_base_url` is `"http://192.168.1.2:3001"`
- **THEN** the status endpoint is `"http://192.168.1.2:3001/status"`
