-- Per-feed default view replaces the full_content switch: how an article opens
-- (feed text, full article, or the original web page).

ALTER TABLE feeds ADD COLUMN default_view TEXT NOT NULL DEFAULT 'feed'
	CHECK (default_view IN ('feed', 'full', 'web'));

UPDATE feeds SET default_view = 'full' WHERE full_content = 1;

ALTER TABLE feeds DROP COLUMN full_content;
