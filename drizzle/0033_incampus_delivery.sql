ALTER TABLE `orders` ADD `incampus_delivery` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `incampus_type` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `campus_building` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `classroom_number` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `incampus_fee_paise` integer DEFAULT 0 NOT NULL;
