CREATE TABLE `push_subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `endpoint` text NOT NULL UNIQUE,
  `subscription_json` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE INDEX `idx_push_subscriptions_email` ON `push_subscriptions` (`email`);

CREATE TABLE `admin_members` (
  `email` text PRIMARY KEY NOT NULL,
  `role` text NOT NULL,
  `created_at` text NOT NULL,
  `created_by` text NOT NULL,
  `updated_at` text NOT NULL
);
INSERT OR IGNORE INTO `admin_members` (`email`,`role`,`created_at`,`created_by`,`updated_at`) VALUES
  ('bharathsaipulipati@gmail.com','OWNER',datetime('now'),'SYSTEM',datetime('now')),
  ('raniramyasana@gmail.com','OWNER',datetime('now'),'SYSTEM',datetime('now'));

CREATE INDEX `idx_orders_customer_payment_created` ON `orders` (`customer_email`,`payment_status`,`created_at`);
CREATE INDEX `idx_orders_payment_created` ON `orders` (`payment_status`,`created_at`);
PRAGMA optimize;
