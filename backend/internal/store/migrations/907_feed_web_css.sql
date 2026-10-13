-- Optional custom CSS per feed, injected into the copied web page view.
-- A side table keeps model.Feed and the feeds queries untouched.

CREATE TABLE feed_web_css (
	feed_id    INTEGER PRIMARY KEY REFERENCES feeds(id) ON UPDATE CASCADE ON DELETE CASCADE,
	css        TEXT NOT NULL,
	updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
