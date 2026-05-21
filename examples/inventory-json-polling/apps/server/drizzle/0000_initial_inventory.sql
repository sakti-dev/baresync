CREATE TABLE `sync_batch_requests` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `client_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_hash` text NOT NULL,
  `status` text NOT NULL,
  `response_body` text,
  `created_at` integer NOT NULL,
  `completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_batch_requests_client_idemp_idx` ON `sync_batch_requests` (`client_id`,`idempotency_key`);
--> statement-breakpoint
CREATE TABLE `locations` (
  `id` text PRIMARY KEY NOT NULL,
  `scope_id` text NOT NULL,
  `name` text NOT NULL,
  `deleted_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `sync_updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `locations_scope_sync_idx` ON `locations` (`scope_id`,`sync_updated_at`);
--> statement-breakpoint
CREATE TABLE `items` (
  `id` text PRIMARY KEY NOT NULL,
  `scope_id` text NOT NULL,
  `location_id` text NOT NULL,
  `name` text NOT NULL,
  `sku` text,
  `deleted_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `sync_updated_at` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `items_scope_sync_idx` ON `items` (`scope_id`,`sync_updated_at`);
--> statement-breakpoint
CREATE INDEX `items_location_idx` ON `items` (`location_id`);
--> statement-breakpoint
CREATE TABLE `stock_counts` (
  `id` text PRIMARY KEY NOT NULL,
  `scope_id` text NOT NULL,
  `item_id` text NOT NULL,
  `counted_quantity` integer NOT NULL,
  `recorded_at` text NOT NULL,
  `deleted_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `sync_updated_at` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_counts_scope_sync_idx` ON `stock_counts` (`scope_id`,`sync_updated_at`);
--> statement-breakpoint
CREATE INDEX `stock_counts_item_idx` ON `stock_counts` (`item_id`);
