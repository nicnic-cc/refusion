-- An item's own page on the feed's site (link blogs and aggregators point the
-- main link elsewhere), and the per-feed choice to open it instead.

ALTER TABLE items ADD COLUMN permalink TEXT;

ALTER TABLE feeds ADD COLUMN open_permalink INTEGER NOT NULL DEFAULT 0;
