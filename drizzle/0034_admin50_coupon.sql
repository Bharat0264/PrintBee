ALTER TABLE `orders` ADD `coupon_code` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `coupon_delivery_discount_paise` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (`coupon_code` text NOT NULL, `customer_email` text NOT NULL, `order_id` text NOT NULL, `created_at` text NOT NULL, PRIMARY KEY(`coupon_code`,`customer_email`));
--> statement-breakpoint
CREATE INDEX `idx_coupon_redemptions_code_created_at` ON `coupon_redemptions` (`coupon_code`,`created_at`);
