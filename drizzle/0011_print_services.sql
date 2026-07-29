CREATE TABLE `print_services` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `is_binding` integer DEFAULT false NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `print_services` (`id`, `name`, `description`, `active`, `is_binding`, `created_at`) VALUES
('document-printing', 'Document printing', 'Standard A4 document printing', 1, 0, CURRENT_TIMESTAMP),
('document-binding', 'Document printing with binding', 'Printed and soft bound; allow 15–25 minutes based on location', 1, 1, CURRENT_TIMESTAMP);
