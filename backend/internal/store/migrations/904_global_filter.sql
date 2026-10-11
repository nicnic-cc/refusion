-- One global article filter (Remove only), next to the per-feed ones in 903.
-- A single-row table: changing feed_filters' primary key would rebuild it.
-- It sets the same items.filtered flag; see docs/feed-filter.md.

CREATE TABLE global_filter (
	id          INTEGER PRIMARY KEY CHECK (id = 1),
	action      TEXT NOT NULL DEFAULT 'remove' CHECK (action = 'remove'),
	"join"      TEXT NOT NULL CHECK ("join" IN ('and', 'or')),
	whole_words INTEGER NOT NULL DEFAULT 0,
	enabled     INTEGER NOT NULL DEFAULT 1,
	conditions  TEXT NOT NULL DEFAULT '[]',
	updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
