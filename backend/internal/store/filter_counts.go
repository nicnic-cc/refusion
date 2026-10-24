package store

import (
	"database/sql"
	"encoding/json"

	"github.com/0x2E/fusion/internal/model"
)

// HiddenCounts returns, for each feed with a hidden article, how many its own
// filter hides, how many its folder's filter hides (and not its own) and how
// many only the global filter hides.
func (s *Store) HiddenCounts() (map[int64]model.HiddenCounts, error) {
	rows, err := s.db.Query(`
		SELECT feed_id,
		       COALESCE(SUM(filtered_global = 0 AND filtered_group = 0), 0),
		       COALESCE(SUM(filtered_group = 1), 0),
		       COALESCE(SUM(filtered_global = 1), 0)
		FROM items
		WHERE filtered = 1
		GROUP BY feed_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[int64]model.HiddenCounts{}
	for rows.Next() {
		var feedID int64
		var c model.HiddenCounts
		if err := rows.Scan(&feedID, &c.Feed, &c.Group, &c.Global); err != nil {
			return nil, err
		}
		counts[feedID] = c
	}
	return counts, rows.Err()
}

// markFilteredGlobal sets FilteredGroup and FilteredGlobal on the filtered
// items, keeping the flags out of the upstream item queries.
func (s *Store) markFilteredGlobal(items ...*model.Item) error {
	byID := map[int64]*model.Item{}
	ids := []int64{}
	for _, it := range items {
		if it.Filtered {
			byID[it.ID] = it
			ids = append(ids, it.ID)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	encoded, err := json.Marshal(ids)
	if err != nil {
		return err
	}
	rows, err := s.db.Query(`
		SELECT id, filtered_group, filtered_global FROM items
		WHERE (filtered_group = 1 OR filtered_global = 1) AND id IN (SELECT value FROM json_each(:ids))
	`, sql.Named("ids", string(encoded)))
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var group, global int
		if err := rows.Scan(&id, &group, &global); err != nil {
			return err
		}
		byID[id].FilteredGroup = intToBool(group)
		byID[id].FilteredGlobal = intToBool(global)
	}
	return rows.Err()
}
