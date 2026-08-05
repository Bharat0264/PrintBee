CREATE TABLE `checkout_fee_settings` (`id` text PRIMARY KEY NOT NULL, `gateway_enabled` integer DEFAULT true NOT NULL, `surge_enabled` integer DEFAULT false NOT NULL, `surge_type` text DEFAULT 'PERCENT' NOT NULL, `surge_value` real DEFAULT 0 NOT NULL, `updated_at` text NOT NULL, `updated_by` text);
--> statement-breakpoint
INSERT INTO `checkout_fee_settings` (`id`,`gateway_enabled`,`surge_enabled`,`surge_type`,`surge_value`,`updated_at`) VALUES ('main',1,0,'PERCENT',0,CURRENT_TIMESTAMP);
--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_gateway_fee_paise` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `surge_fee_paise` integer DEFAULT 0 NOT NULL;
