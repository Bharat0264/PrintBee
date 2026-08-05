ALTER TABLE `order_availability` ADD `launch_at` text DEFAULT '2026-08-10T03:30:00.000Z' NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_availability` ADD `launch_message` text DEFAULT 'Site will be live from Aug 10 2026, 9 A.M. IST' NOT NULL;
