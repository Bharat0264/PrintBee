CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_email` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`storage_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`page_count` integer NOT NULL,
	`order_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_storage_key_unique` ON `uploads` (`storage_key`);--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_code_encrypted` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_reference` text;