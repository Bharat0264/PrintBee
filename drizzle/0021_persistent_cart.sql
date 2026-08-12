CREATE TABLE `cart_items` (`id` text PRIMARY KEY NOT NULL, `customer_email` text NOT NULL, `upload_id` text NOT NULL, `item_json` text NOT NULL, `created_at` text NOT NULL);
CREATE UNIQUE INDEX `cart_items_upload_id_unique` ON `cart_items` (`upload_id`);
CREATE INDEX `idx_cart_items_customer_email_created_at` ON `cart_items` (`customer_email`, `created_at`);
