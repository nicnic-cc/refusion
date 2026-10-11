package store

import (
	"database/sql"
	"fmt"
)

// ReorderGroups sets the folder order. ids must be exactly the set of all groups.
func (s *Store) ReorderGroups(ids []int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	current, err := queryIDs(tx, `SELECT id FROM groups`)
	if err != nil {
		return err
	}
	if err := requireSameIDs(current, ids); err != nil {
		return err
	}

	for i, id := range ids {
		if _, err := tx.Exec(
			`UPDATE groups SET position = :position WHERE id = :id`,
			sql.Named("position", i), sql.Named("id", id),
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ReorderFeeds sets the feed order within one group. ids must be exactly the
// set of that group's feeds.
func (s *Store) ReorderFeeds(groupID int64, ids []int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var exists int
	if err := tx.QueryRow(
		`SELECT COUNT(*) FROM groups WHERE id = :id`, sql.Named("id", groupID),
	).Scan(&exists); err != nil {
		return err
	}
	if exists == 0 {
		return fmt.Errorf("%w: group", ErrNotFound)
	}

	current, err := queryIDs(tx, `SELECT id FROM feeds WHERE group_id = :group_id`, sql.Named("group_id", groupID))
	if err != nil {
		return err
	}
	if err := requireSameIDs(current, ids); err != nil {
		return err
	}

	for i, id := range ids {
		if _, err := tx.Exec(
			`UPDATE feeds SET position = :position WHERE id = :id`,
			sql.Named("position", i), sql.Named("id", id),
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func queryIDs(tx *sql.Tx, query string, args ...any) (map[int64]bool, error) {
	rows, err := tx.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := map[int64]bool{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids[id] = true
	}
	return ids, rows.Err()
}

func requireSameIDs(current map[int64]bool, ids []int64) error {
	seen := make(map[int64]bool, len(ids))
	for _, id := range ids {
		if seen[id] {
			return fmt.Errorf("%w: duplicate id %d", ErrInvalid, id)
		}
		if !current[id] {
			return fmt.Errorf("%w: unexpected id %d", ErrInvalid, id)
		}
		seen[id] = true
	}
	if len(seen) != len(current) {
		return fmt.Errorf("%w: ids must list every item exactly once", ErrInvalid)
	}
	return nil
}
