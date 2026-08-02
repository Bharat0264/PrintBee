CREATE TABLE `packaging_charge_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`min_pages` integer NOT NULL,
	`max_pages` integer NOT NULL,
	`charge_paise` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `packaging_fee_paise` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_packaging_charge_rules_range` ON `packaging_charge_rules` (`min_pages`,`max_pages`);
