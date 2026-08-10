ALTER TABLE `checkout_fee_settings` ADD `late_night_enabled` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `checkout_fee_settings` ADD `late_night_type` text DEFAULT 'PERCENT' NOT NULL;
--> statement-breakpoint
ALTER TABLE `checkout_fee_settings` ADD `late_night_value` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `late_night_fee_paise` integer DEFAULT 0 NOT NULL;
