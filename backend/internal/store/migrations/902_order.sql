-- User-defined list order for folders, and for feeds within a folder.
-- New rows and moved feeds land last. The triggers only set position, so they
-- never re-fire themselves.

ALTER TABLE groups ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feeds ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

UPDATE groups SET position = (
	SELECT COUNT(*) FROM groups g2 WHERE g2.id < groups.id
);
UPDATE feeds SET position = (
	SELECT COUNT(*) FROM feeds f2 WHERE f2.group_id = feeds.group_id AND f2.id < feeds.id
);

CREATE TRIGGER groups_position_ai AFTER INSERT ON groups BEGIN
	UPDATE groups
	SET position = (SELECT COALESCE(MAX(g.position), -1) + 1 FROM groups g WHERE g.id != new.id)
	WHERE id = new.id;
END;

CREATE TRIGGER feeds_position_ai AFTER INSERT ON feeds BEGIN
	UPDATE feeds
	SET position = (
		SELECT COALESCE(MAX(f.position), -1) + 1
		FROM feeds f
		WHERE f.group_id = new.group_id AND f.id != new.id
	)
	WHERE id = new.id;
END;

CREATE TRIGGER feeds_position_group_au AFTER UPDATE OF group_id ON feeds
WHEN old.group_id IS NOT new.group_id
BEGIN
	UPDATE feeds
	SET position = (
		SELECT COALESCE(MAX(f.position), -1) + 1
		FROM feeds f
		WHERE f.group_id = new.group_id AND f.id != new.id
	)
	WHERE id = new.id;
END;
