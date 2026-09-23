CREATE TABLE `order_status_history` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL,
  `previous_status` text,
  `new_status` text NOT NULL,
  `changed_by` text NOT NULL,
  `actor_type` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_order_status_history_order` ON `order_status_history` (`order_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `current_rider_locations` (
  `order_id` text PRIMARY KEY NOT NULL,
  `rider_email` text NOT NULL,
  `latitude` real NOT NULL,
  `longitude` real NOT NULL,
  `accuracy` real,
  `updated_at` text NOT NULL
);
