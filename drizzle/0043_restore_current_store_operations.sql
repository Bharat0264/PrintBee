DELETE FROM `franchise_members`
WHERE `email` = 'raniramyasana@gmail.com'
  AND `store_id` IN (
    SELECT `id` FROM `franchise_stores`
    WHERE `latitude` = (SELECT `latitude` FROM `store_location` WHERE `id` = 'main')
      AND `longitude` = (SELECT `longitude` FROM `store_location` WHERE `id` = 'main')
  );--> statement-breakpoint
UPDATE `franchise_stores`
SET `active` = 0, `updated_at` = datetime('now')
WHERE `latitude` = (SELECT `latitude` FROM `store_location` WHERE `id` = 'main')
  AND `longitude` = (SELECT `longitude` FROM `store_location` WHERE `id` = 'main');
