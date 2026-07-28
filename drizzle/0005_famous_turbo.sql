ALTER TABLE `app_users` ADD `name` text;--> statement-breakpoint
ALTER TABLE `app_users` ADD `mobile_number` text;--> statement-breakpoint
ALTER TABLE `app_users` ADD `approval_status` text DEFAULT 'APPROVED' NOT NULL;--> statement-breakpoint
ALTER TABLE `locations` ADD `delivery_fee_paise` integer DEFAULT 1500 NOT NULL;--> statement-breakpoint
ALTER TABLE `locations` ADD `platform_fee_paise` integer DEFAULT 350 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_rejection_reason` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_verified_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_verified_by` text;