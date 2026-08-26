-- Persisting the breakdown prevents database defaults from corrupting receipts.
UPDATE `checkout_fee_settings` SET `platform_fee_paise` = 150 WHERE `id` = 'main';
