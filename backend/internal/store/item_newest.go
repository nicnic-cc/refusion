package store

import "database/sql"

// MaxItemID returns the highest item id, or 0 when there are no items.
func (s *Store) MaxItemID() (int64, error) {
	var id int64
	err := s.db.QueryRow(`SELECT COALESCE(MAX(id), 0) FROM items`).Scan(&id)
	return id, err
}

// CountItemsAfter counts items with id > afterID, filtered like ListItems.
func (s *Store) CountItemsAfter(afterID int64, feedID, groupID *int64) (int, error) {
	query := `SELECT COUNT(*) FROM items`
	args := []any{sql.Named("after_id", afterID)}

	if groupID != nil {
		query += ` INNER JOIN feeds ON items.feed_id = feeds.id`
	}
	query += ` WHERE items.id > :after_id`

	if feedID != nil {
		query += ` AND items.feed_id = :feed_id`
		args = append(args, sql.Named("feed_id", *feedID))
	}
	if groupID != nil {
		query += ` AND feeds.group_id = :group_id`
		args = append(args, sql.Named("group_id", *groupID))
	}

	var count int
	err := s.db.QueryRow(query, args...).Scan(&count)
	return count, err
}
