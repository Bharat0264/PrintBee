CREATE TABLE `rider_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`rider_email` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`payment_date` text NOT NULL,
	`note` text,
	`recorded_by` text NOT NULL,
	`created_at` text NOT NULL
);
