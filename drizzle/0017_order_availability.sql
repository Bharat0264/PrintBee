CREATE TABLE `order_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`accepting_orders` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
INSERT INTO `order_availability` (`id`, `accepting_orders`, `updated_at`) VALUES ('main', 1, CURRENT_TIMESTAMP);
