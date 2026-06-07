## Default Permission

### Default Permissions

This permission set enables the Baresync local database, migration, sync, polling, and runtime header commands.

These commands are intended for trusted Tauri app frontends that own the local sync database and need to attach auth headers to sync requests.

#### This default permission set includes the following:

- `allow-run-sql`
- `allow-run-sql-batch`
- `allow-get-db-info`
- `allow-run-migrations`
- `allow-get-migration-status`
- `allow-sync-now`
- `allow-sync-push`
- `allow-sync-pull`
- `allow-set-headers`
- `allow-sync-full-resync`
- `allow-get-sync-local-state`
- `allow-purge-synced-outbox`
- `allow-run-garbage-collection`
- `allow-start-polling`
- `allow-stop-polling`
- `allow-pause-polling`
- `allow-resume-polling`
- `allow-get-polling-status`

## Permission Table

<table>
<tr>
<th>Identifier</th>
<th>Description</th>
</tr>


<tr>
<td>

`baresync:allow-get-db-info`

</td>
<td>

Enables the get_db_info command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-get-db-info`

</td>
<td>

Denies the get_db_info command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-get-migration-status`

</td>
<td>

Enables the get_migration_status command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-get-migration-status`

</td>
<td>

Denies the get_migration_status command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-get-polling-status`

</td>
<td>

Enables the get_polling_status command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-get-polling-status`

</td>
<td>

Denies the get_polling_status command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-get-sync-local-state`

</td>
<td>

Enables the get_sync_local_state command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-get-sync-local-state`

</td>
<td>

Denies the get_sync_local_state command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-pause-polling`

</td>
<td>

Enables the pause_polling command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-pause-polling`

</td>
<td>

Denies the pause_polling command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-purge-synced-outbox`

</td>
<td>

Enables the purge_synced_outbox command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-purge-synced-outbox`

</td>
<td>

Denies the purge_synced_outbox command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-resume-polling`

</td>
<td>

Enables the resume_polling command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-resume-polling`

</td>
<td>

Denies the resume_polling command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-run-garbage-collection`

</td>
<td>

Enables the run_garbage_collection command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-run-garbage-collection`

</td>
<td>

Denies the run_garbage_collection command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-run-migrations`

</td>
<td>

Enables the run_migrations command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-run-migrations`

</td>
<td>

Denies the run_migrations command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-run-sql`

</td>
<td>

Enables the run_sql command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-run-sql`

</td>
<td>

Denies the run_sql command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-run-sql-batch`

</td>
<td>

Enables the run_sql_batch command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-run-sql-batch`

</td>
<td>

Denies the run_sql_batch command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-set-headers`

</td>
<td>

Enables the set_headers command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-set-headers`

</td>
<td>

Denies the set_headers command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-start-polling`

</td>
<td>

Enables the start_polling command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-start-polling`

</td>
<td>

Denies the start_polling command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-stop-polling`

</td>
<td>

Enables the stop_polling command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-stop-polling`

</td>
<td>

Denies the stop_polling command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-sync-full-resync`

</td>
<td>

Enables the sync_full_resync command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-sync-full-resync`

</td>
<td>

Denies the sync_full_resync command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-sync-now`

</td>
<td>

Enables the sync_now command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-sync-now`

</td>
<td>

Denies the sync_now command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-sync-pull`

</td>
<td>

Enables the sync_pull command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-sync-pull`

</td>
<td>

Denies the sync_pull command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:allow-sync-push`

</td>
<td>

Enables the sync_push command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`baresync:deny-sync-push`

</td>
<td>

Denies the sync_push command without any pre-configured scope.

</td>
</tr>
</table>
