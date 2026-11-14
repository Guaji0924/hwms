-- ============================================================
-- d1-schema.sql —— 同步数据库建表语句（在 Cloudflare D1 控制台执行一次即可）
-- ------------------------------------------------------------
-- 只有一张表 sync_rows，存所有需要同步的数据行：
--   store  表名（materials/records/users/logs/settings）
--   id     主键（物料的编号、记录的编号等）
--   data   这一行的完整内容（JSON 字符串，含 updatedAt 等所有字段）
--   rev    服务器收到这一行的毫秒时间戳，用来做增量下拉
-- (store, id) 组成联合主键，保证每张表里同一个 id 只有一份。
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_rows (
  store TEXT NOT NULL,
  id    TEXT NOT NULL,
  data  TEXT NOT NULL,
  rev   INTEGER NOT NULL,
  PRIMARY KEY (store, id)
);

-- 给 rev 建索引，加速"增量下拉"（WHERE rev > ?）的查询
CREATE INDEX IF NOT EXISTS idx_sync_rows_rev ON sync_rows (rev);

-- 分页拉取用的复合索引：翻页条件 (rev, store, id) > (?, ?, ?) 靠它走
-- "覆盖索引范围查询"（SEARCH），避免退化成全表扫描烧读取额度。
-- 注意：不能建 (rev, rowid) 索引 —— SQLite 不允许对隐式 rowid 建索引。
-- 已部署的库补执行下面这句即可，重复执行无害。
CREATE INDEX IF NOT EXISTS idx_sync_rows_page ON sync_rows (rev, store, id);