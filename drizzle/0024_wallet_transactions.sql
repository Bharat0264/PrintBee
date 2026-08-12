CREATE TABLE `wallet_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`points` integer NOT NULL,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`order_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_wallet_transactions_email_created_at` ON `wallet_transactions` (`email`, `created_at`);
