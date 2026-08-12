ALTER TABLE `orders` ADD `spend_points_awarded` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Credit historical delivered orders once at one point per complete ₹10 spent.
UPDATE `customer_profiles`
SET `points_balance` = `points_balance` + COALESCE((
  SELECT SUM(CAST(o.`total_paise` / 1000 AS INTEGER))
  FROM `orders` o
  WHERE o.`customer_email` = `customer_profiles`.`email` AND o.`status` = 'DELIVERED'
), 0);
--> statement-breakpoint
INSERT OR IGNORE INTO `wallet_transactions` (`id`,`email`,`points`,`kind`,`description`,`order_id`,`created_at`)
SELECT 'spend-' || o.`id`, o.`customer_email`, CAST(o.`total_paise` / 1000 AS INTEGER), 'DELIVERY_SPEND_REWARD',
       CAST(o.`total_paise` / 1000 AS INTEGER) || ' points earned after delivery of order ' || o.`order_number`,
       o.`id`, COALESCE(o.`delivered_at`, datetime('now'))
FROM `orders` o
WHERE o.`status` = 'DELIVERED' AND CAST(o.`total_paise` / 1000 AS INTEGER) > 0;
--> statement-breakpoint
UPDATE `orders` SET `spend_points_awarded` = CAST(`total_paise` / 1000 AS INTEGER) WHERE `status` = 'DELIVERED';
