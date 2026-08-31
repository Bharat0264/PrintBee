INSERT INTO `print_services` (`id`, `name`, `description`, `active`, `is_binding`, `counts_for_packaging`, `price_paise`, `created_at`)
VALUES ('turnitin-plagiarism-check', 'Turnitin plagiarism check', 'Plagiarism report for papers and reports, delivered on WhatsApp within 24 hours', 1, 0, 0, 17500, CURRENT_TIMESTAMP)
ON CONFLICT(`id`) DO UPDATE SET
  `name` = excluded.`name`,
  `description` = excluded.`description`,
  `price_paise` = excluded.`price_paise`,
  `active` = 1,
  `counts_for_packaging` = 0;
