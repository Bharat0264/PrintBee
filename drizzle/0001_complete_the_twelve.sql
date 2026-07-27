ALTER TABLE `orders` ADD `printing_subtotal_paise` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_fee_paise` integer DEFAULT 1500 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `platform_fee_paise` integer DEFAULT 350 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_status` text DEFAULT 'PENDING' NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `razorpay_order_id` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `razorpay_payment_id` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `rider_email` text;
