ALTER TABLE `print_services` ADD `counts_for_packaging` integer DEFAULT true NOT NULL;
UPDATE `print_services` SET `counts_for_packaging` = 0 WHERE `id` <> 'document-printing';
