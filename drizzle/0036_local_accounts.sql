CREATE TABLE `local_accounts` (`email` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `mobile_number` text NOT NULL, `password_salt` text NOT NULL, `password_hash` text NOT NULL, `created_at` text NOT NULL);
CREATE TABLE `local_sessions` (`id` text PRIMARY KEY NOT NULL, `email` text NOT NULL, `expires_at` text NOT NULL, `created_at` text NOT NULL);
CREATE INDEX `local_sessions_email_idx` ON `local_sessions` (`email`);
