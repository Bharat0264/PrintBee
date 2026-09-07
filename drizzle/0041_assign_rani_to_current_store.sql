INSERT OR IGNORE INTO `franchise_members` (`store_id`,`email`,`created_at`)
SELECT `id`, 'raniramyasana@gmail.com', datetime('now')
FROM `franchise_stores`
WHERE `latitude` = (SELECT `latitude` FROM `store_location` WHERE `id` = 'main')
  AND `longitude` = (SELECT `longitude` FROM `store_location` WHERE `id` = 'main')
  AND `active` = 1;
