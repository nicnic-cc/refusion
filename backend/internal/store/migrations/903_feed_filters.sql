-- One article filter per feed. items.filtered is the stored result of the Go
-- matcher (internal/filter), so reads only test a column and never run a regex.
-- Conditions are a JSON array; the store re-checks the feed's items on every change.

CREATE TABLE feed_filters (
	feed_id     INTEGER PRIMARY KEY REFERENCES feeds(id) ON UPDATE CASCADE ON DELETE CASCADE,
	action      TEXT NOT NULL CHECK (action IN ('remove', 'keep')),
	"join"      TEXT NOT NULL CHECK ("join" IN ('and', 'or')),
	whole_words INTEGER NOT NULL DEFAULT 0,
	enabled     INTEGER NOT NULL DEFAULT 1,
	conditions  TEXT NOT NULL DEFAULT '[]',
	updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

ALTER TABLE items ADD COLUMN filtered INTEGER NOT NULL DEFAULT 0;
