CREATE TABLE `order_sequences` (
	`id` text PRIMARY KEY NOT NULL,
	`next_value` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
INSERT INTO `order_sequences` (`id`, `next_value`) VALUES ('orders', 1);
