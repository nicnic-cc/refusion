package store

import "database/sql"

// MarkScopeRead marks read every item with id <= maxID in a feed, a group or
// (both nil) everywhere. maxID is the list's snapshot, so items saved after
// the user loaded the list stay unread.
func (s *Store) MarkScopeRead(maxID int64, feedID, groupID *int64) error {
	query := `UPDATE items SET unread = 0 WHERE unread = 1 AND id <= :max_id`
	args := []any{sql.Named("max_id", maxID)}

	if feedID != nil {
		query += ` AND feed_id = :feed_id`
		args = append(args, sql.Named("feed_id", *feedID))
	}
	if groupID != nil {
		query += ` AND feed_id IN (SELECT id FROM feeds WHERE group_id = :group_id)`
		args = append(args, sql.Named("group_id", *groupID))
	}

	_, err := s.db.Exec(query, args...)
	return err
}
