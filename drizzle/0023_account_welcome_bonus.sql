-- Give every existing profile the one-time account creation bonus.
UPDATE `customer_profiles` SET `points_balance` = `points_balance` + 10;
--> statement-breakpoint
-- Create bonus profiles for known riders/admin users that do not have one yet.
INSERT OR IGNORE INTO `customer_profiles` (`email`, `referral_code`, `points_balance`, `created_at`)
SELECT `email`, 'PB' || upper(substr(hex(randomblob(8)), 1, 8)), 10, datetime('now') FROM `app_users`;
--> statement-breakpoint
-- Create bonus profiles for known customers that do not have one yet.
INSERT OR IGNORE INTO `customer_profiles` (`email`, `referral_code`, `points_balance`, `created_at`)
SELECT DISTINCT `customer_email`, 'PB' || upper(substr(hex(randomblob(8)), 1, 8)), 10, datetime('now') FROM `orders`;
