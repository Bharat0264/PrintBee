ALTER TABLE `checkout_fee_settings` ADD `packaging_enabled` integer DEFAULT false NOT NULL;
ALTER TABLE `checkout_fee_settings` ADD `packaging_fee_paise` integer DEFAULT 0 NOT NULL;
