ALTER TABLE projects ADD COLUMN project_code text;
UPDATE projects SET project_code = 'PB-' || upper(substr(replace(id,'-',''),1,8)) WHERE project_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS projects_project_code_unique ON projects(project_code);
ALTER TABLE project_orders ADD COLUMN listed_price_paise integer NOT NULL DEFAULT 0;
ALTER TABLE project_orders ADD COLUMN seller_payout_paise integer NOT NULL DEFAULT 0;
ALTER TABLE project_orders ADD COLUMN platform_fee_paise integer NOT NULL DEFAULT 0;
