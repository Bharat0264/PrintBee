ALTER TABLE `app_users` ADD `is_available` integer DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE `customer_profiles` (
	`email` text PRIMARY KEY NOT NULL,
	`referral_code` text NOT NULL,
	`referred_by_email` text,
	`points_balance` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_profiles_referral_code_unique` ON `customer_profiles` (`referral_code`);
--> statement-breakpoint
ALTER TABLE `orders` ADD `points_redeemed` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `points_discount_paise` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `referral_rewarded_at` text;
--> statement-breakpoint
CREATE TABLE `order_feedback` (
	`order_id` text PRIMARY KEY NOT NULL,
	`customer_email` text NOT NULL,
	`service_rating` integer NOT NULL,
	`rider_rating` integer NOT NULL,
	`print_quality_rating` integer NOT NULL,
	`overall_rating` integer NOT NULL,
	`description` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_customer_profiles_referred_by_email` ON `customer_profiles` (`referred_by_email`);
