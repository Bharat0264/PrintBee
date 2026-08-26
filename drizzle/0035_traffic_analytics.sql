CREATE TABLE `traffic_events` (`id` text PRIMARY KEY NOT NULL, `visitor_id` text NOT NULL, `event` text NOT NULL, `path` text NOT NULL, `created_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_traffic_events_created_at` ON `traffic_events` (`created_at`);
