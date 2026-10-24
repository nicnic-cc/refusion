-- One article filter per folder, next to the per-feed (903) and global (904)
-- ones. Same columns as feed_filters; see .agents/notes/feed-filter.md.
-- items.filtered_group = 1 when the folder filter hides the article and the
-- feed's own filter does not.

CREATE TABLE group_filters (
	group_id    INTEGER PRIMARY KEY REFERENCES groups(id) ON UPDATE CASCADE ON DELETE CASCADE,
	action      TEXT NOT NULL CHECK (action IN ('remove', 'keep')),
	"join"      TEXT NOT NULL CHECK ("join" IN ('and', 'or')),
	whole_words INTEGER NOT NULL DEFAULT 0,
	enabled     INTEGER NOT NULL DEFAULT 1,
	conditions  TEXT NOT NULL DEFAULT '[]',
	updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

ALTER TABLE items ADD COLUMN filtered_group INTEGER NOT NULL DEFAULT 0;
