CREATE TABLE `app_users` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_name` text NOT NULL,
	`mobile_number` text NOT NULL,
	`location_id` text NOT NULL,
	`location_name` text NOT NULL,
	`items_json` text NOT NULL,
	`total_paise` integer NOT NULL,
	`delivery_code_hash` text NOT NULL,
	`status` text DEFAULT 'PLACED' NOT NULL,
	`created_at` text NOT NULL,
	`delivered_at` text,
	`delivered_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);