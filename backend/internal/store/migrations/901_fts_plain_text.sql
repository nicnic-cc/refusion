-- External-content index over strip_html(content): the FTS5 'delete' command
-- needs the exact indexed text, so strip_html must stay deterministic (a change
-- needs a re-index). Never run 'rebuild': it would index raw HTML from items.
DROP TRIGGER IF EXISTS items_fts_items_ai;
DROP TRIGGER IF EXISTS items_fts_items_ad;
DROP TRIGGER IF EXISTS items_fts_items_au;
DROP TABLE IF EXISTS items_fts;

CREATE VIRTUAL TABLE items_fts USING fts5(
	title,
	content,
	content = 'items',
	content_rowid = 'id',
	tokenize = 'unicode61'
);

CREATE TRIGGER items_fts_items_ai AFTER INSERT ON items BEGIN
	INSERT INTO items_fts(rowid, title, content)
	VALUES (new.id, new.title, strip_html(new.content));
END;

CREATE TRIGGER items_fts_items_ad AFTER DELETE ON items BEGIN
	INSERT INTO items_fts(items_fts, rowid, title, content)
	VALUES ('delete', old.id, old.title, strip_html(old.content));
END;

CREATE TRIGGER items_fts_items_au AFTER UPDATE OF title, content ON items BEGIN
	INSERT INTO items_fts(items_fts, rowid, title, content)
	VALUES ('delete', old.id, old.title, strip_html(old.content));
	INSERT INTO items_fts(rowid, title, content)
	VALUES (new.id, new.title, strip_html(new.content));
END;

INSERT INTO items_fts(rowid, title, content)
SELECT id, title, strip_html(content) FROM items;
