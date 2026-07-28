CREATE TABLE `rider_withdrawals` (
	`id` text PRIMARY KEY NOT NULL,
	`rider_email` text NOT NULL,
	`upi_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`requested_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text
);
