package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/0x2E/fusion/internal/filter"
	"github.com/0x2E/fusion/internal/model"
)

const groupFilterSelect = `
	SELECT g.group_id, g.action, g."join", g.whole_words, g.enabled, g.conditions, g.updated_at
	FROM group_filters g
`

func scanGroupFilter(row rowScanner) (*model.GroupFilter, error) {
	f := &model.GroupFilter{}
	var wholeWords, enabled int
	var conditions string
	if err := row.Scan(&f.GroupID, &f.Action, &f.Join, &wholeWords, &enabled, &conditions, &f.UpdatedAt); err != nil {
		return nil, err
	}
	f.WholeWords = intToBool(wholeWords)
	f.Enabled = intToBool(enabled)
	if err := json.Unmarshal([]byte(conditions), &f.Conditions); err != nil {
		return nil, fmt.Errorf("decode filter conditions: %w", err)
	}
	if f.Conditions == nil {
		f.Conditions = []filter.Condition{}
	}
	return f, nil
}

func (s *Store) getGroupFilter(groupID int64) (*model.GroupFilter, error) {
	f, err := scanGroupFilter(s.db.QueryRow(groupFilterSelect+` WHERE g.group_id = :group_id`, sql.Named("group_id", groupID)))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: group filter", ErrNotFound)
		}
		return nil, fmt.Errorf("get group filter: %w", err)
	}
	return f, nil
}

func (s *Store) ListGroupFilters() ([]*model.GroupFilter, error) {
	rows, err := s.db.Query(groupFilterSelect + ` ORDER BY g.group_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	filters := []*model.GroupFilter{}
	for rows.Next() {
		f, err := scanGroupFilter(rows)
		if err != nil {
			return nil, err
		}
		filters = append(filters, f)
	}
	return filters, rows.Err()
}

// UpsertGroupFilter saves the folder's rule (Remove or Keep) and re-checks
// every feed of the folder.
func (s *Store) UpsertGroupFilter(groupID int64, rule filter.Rule, enabled bool) (*model.GroupFilterSaved, error) {
	if err := filter.Validate(rule); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if _, err := s.GetGroup(groupID); err != nil {
		return nil, err
	}
	conditions, err := json.Marshal(rule.Conditions)
	if err != nil {
		return nil, err
	}

	_, err = s.db.Exec(`
		INSERT INTO group_filters (group_id, action, "join", whole_words, enabled, conditions, updated_at)
		VALUES (:group_id, :action, :join, :whole_words, :enabled, :conditions, :updated_at)
		ON CONFLICT(group_id) DO UPDATE SET
			action = excluded.action, "join" = excluded."join", whole_words = excluded.whole_words,
			enabled = excluded.enabled, conditions = excluded.conditions, updated_at = excluded.updated_at
	`, sql.Named("group_id", groupID), sql.Named("action", rule.Action), sql.Named("join", rule.Join),
		sql.Named("whole_words", boolToInt(rule.WholeWords)), sql.Named("enabled", boolToInt(enabled)),
		sql.Named("conditions", string(conditions)), sql.Named("updated_at", time.Now().Unix()))
	if err != nil {
		return nil, fmt.Errorf("save group filter: %w", err)
	}
	return s.savedGroupFilter(groupID, false)
}

// SetGroupFilterEnabled switches the folder filter on or off and re-checks.
func (s *Store) SetGroupFilterEnabled(groupID int64, enabled bool) (*model.GroupFilterSaved, error) {
	result, err := s.db.Exec(`UPDATE group_filters SET enabled = :enabled, updated_at = :updated_at WHERE group_id = :group_id`,
		sql.Named("enabled", boolToInt(enabled)), sql.Named("updated_at", time.Now().Unix()), sql.Named("group_id", groupID))
	if err := requireRow(result, err); err != nil {
		return nil, err
	}
	return s.savedGroupFilter(groupID, false)
}

// DeleteGroupFilter removes the folder filter and re-checks, so the articles
// only it hid come back.
func (s *Store) DeleteGroupFilter(groupID int64) (*model.GroupFilterSaved, error) {
	result, err := s.db.Exec(`DELETE FROM group_filters WHERE group_id = :group_id`, sql.Named("group_id", groupID))
	if err := requireRow(result, err); err != nil {
		return nil, err
	}
	return s.savedGroupFilter(groupID, true)
}

func requireRow(result sql.Result, err error) error {
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("%w: group filter", ErrNotFound)
	}
	return nil
}

// savedGroupFilter re-checks the folder's feeds after a committed change, one
// short transaction per feed, and counts what is now hidden in them.
func (s *Store) savedGroupFilter(groupID int64, deleted bool) (*model.GroupFilterSaved, error) {
	feedIDs, err := listIDs(s.db, groupFeedsQuery, sql.Named("group_id", groupID))
	if err != nil {
		return nil, err
	}
	if err := s.recomputeFeeds(feedIDs); err != nil {
		return nil, fmt.Errorf("re-check articles: %w", err)
	}
	saved := &model.GroupFilterSaved{}
	if err := s.db.QueryRow(`
		SELECT COUNT(*) FROM items i JOIN feeds f ON f.id = i.feed_id
		WHERE i.filtered = 1 AND f.group_id = :group_id
	`, sql.Named("group_id", groupID)).Scan(&saved.HiddenTotal); err != nil {
		return nil, err
	}
	if !deleted {
		if saved.GroupFilter, err = s.getGroupFilter(groupID); err != nil {
			return nil, err
		}
	}
	return saved, nil
}

// PreviewGroupFilter runs a draft rule over the latest articles of the
// folder's feeds without saving anything.
func (s *Store) PreviewGroupFilter(groupID int64, rule filter.Rule) (*model.GlobalPreview, error) {
	if _, err := s.GetGroup(groupID); err != nil {
		return nil, err
	}
	return s.previewLatest(rule, &groupID)
}

// recheckMovedFeedTx re-checks a feed inside UpdateFeed's transaction when
// it moved to another folder (newGroupID set), so the new folder's filter
// applies at once.
func recheckMovedFeedTx(tx *sql.Tx, feedID int64, newGroupID *int64) error {
	if newGroupID == nil {
		return nil
	}
	return recomputeFilterTx(tx, feedID)
}

const groupFeedsQuery = `SELECT id FROM feeds WHERE group_id = :group_id ORDER BY id`

// groupFeedIDsTx lists a folder's feeds inside DeleteGroup's transaction,
// before they move to the default folder. DeleteGroup re-checks them after
// commit, so they pick up the default folder's filter.
func groupFeedIDsTx(tx *sql.Tx, groupID int64) ([]int64, error) {
	return listIDs(tx, groupFeedsQuery, sql.Named("group_id", groupID))
}
