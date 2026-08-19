ALTER TABLE `checkout_fee_settings` ADD `delivery_base_fee_paise` integer DEFAULT 1000 NOT NULL;
--> statement-breakpoint
ALTER TABLE `checkout_fee_settings` ADD `delivery_fee_per_100m_paise` integer DEFAULT 100 NOT NULL;
