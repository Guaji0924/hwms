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