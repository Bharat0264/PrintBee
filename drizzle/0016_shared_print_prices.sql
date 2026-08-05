CREATE TABLE `print_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`price_paise` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `print_prices` (`id`, `price_paise`, `updated_at`) VALUES
	('bw-single', 200, CURRENT_TIMESTAMP),
	('bw-double', 300, CURRENT_TIMESTAMP),
	('colour-single', 800, CURRENT_TIMESTAMP),
	('colour-double', 1400, CURRENT_TIMESTAMP);
