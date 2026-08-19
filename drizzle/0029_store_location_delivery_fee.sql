CREATE TABLE `store_location` (`id` text PRIMARY KEY NOT NULL, `latitude` real NOT NULL, `longitude` real NOT NULL, `accuracy` real, `updated_at` text NOT NULL, `updated_by` text);
--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_latitude` real;
--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_longitude` real;
--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_accuracy` real;
--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_captured_at` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_distance_meters` integer;
--> statement-breakpoint
ALTER TABLE `orders` ADD `store_latitude` real;
--> statement-breakpoint
ALTER TABLE `orders` ADD `store_longitude` real;
