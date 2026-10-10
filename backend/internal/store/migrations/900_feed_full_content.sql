-- Per-feed switch: load the full article automatically when an item opens.

ALTER TABLE feeds ADD COLUMN full_content INTEGER NOT NULL DEFAULT 0;
