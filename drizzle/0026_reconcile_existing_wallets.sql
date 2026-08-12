-- One-time reconciliation for customers that existed before the spend-based
-- referral rules. Their wallet becomes the 10-point welcome bonus plus the
-- points earned from their own delivered orders (1 point per complete ₹10).
INSERT INTO `wallet_transactions` (`id`,`email`,`points`,`kind`,`description`,`order_id`,`created_at`)
SELECT
  'wallet-reconciliation-' || p.`email`,
  p.`email`,
  (10 + COALESCE((
    SELECT SUM(CAST(o.`total_paise` / 1000 AS INTEGER))
    FROM `orders` o
    WHERE o.`customer_email` = p.`email` AND o.`status` = 'DELIVERED'
  ), 0)) - p.`points_balance`,
  'WALLET_RECONCILIATION',
  'Wallet reset to 10 welcome points plus own delivered-order spend points',
  NULL,
  datetime('now')
FROM `customer_profiles` p
WHERE p.`points_balance` != 10 + COALESCE((
  SELECT SUM(CAST(o.`total_paise` / 1000 AS INTEGER))
  FROM `orders` o
  WHERE o.`customer_email` = p.`email` AND o.`status` = 'DELIVERED'
), 0);
--> statement-breakpoint
UPDATE `customer_profiles`
SET `points_balance` = 10 + COALESCE((
  SELECT SUM(CAST(o.`total_paise` / 1000 AS INTEGER))
  FROM `orders` o
  WHERE o.`customer_email` = `customer_profiles`.`email` AND o.`status` = 'DELIVERED'
), 0);
--> statement-breakpoint
UPDATE `orders`
SET `spend_points_awarded` = CAST(`total_paise` / 1000 AS INTEGER)
WHERE `status` = 'DELIVERED';
