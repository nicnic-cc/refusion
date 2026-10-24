package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/0x2E/fusion/internal/filter"
	"github.com/0x2E/fusion/internal/model"
)

// globalPreviewLimit caps the live preview: a full run over every article
// takes seconds. The exact total comes back when the filter is saved.
const globalPreviewLimit = 300

// GetGlobalFilter returns the global filter, or ErrNotFound when none is set.
func (s *Store) GetGlobalFilter() (*model.GlobalFilter, error) {
	f := &model.GlobalFilter{}
	var wholeWords, enabled int
	var conditions string
	err := s.db.QueryRow(`SELECT action, "join", whole_words, enabled, conditions, updated_at FROM global_filter`).
		Scan(&f.Action, &f.Join, &wholeWords, &enabled, &conditions, &f.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("%w: global filter", ErrNotFound)
	}
	if err != nil {
		return nil, fmt.Errorf("get global filter: %w", err)
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

// UpsertGlobalFilter saves the rule (Remove only) and re-checks every article.
func (s *Store) UpsertGlobalFilter(rule filter.Rule, enabled bool) (*model.GlobalFilterSaved, error) {
	if err := filter.Validate(rule); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if rule.Action != filter.ActionRemove {
		return nil, fmt.Errorf("%w: the global filter can only remove", ErrInvalid)
	}
	conditions, err := json.Marshal(rule.Conditions)
	if err != nil {
		return nil, err
	}

	err = s.inTx(func(tx *sql.Tx) error {
		_, err := tx.Exec(`
			INSERT INTO global_filter (id, action, "join", whole_words, enabled, conditions, updated_at)
			VALUES (1, :action, :join, :whole_words, :enabled, :conditions, :updated_at)
			ON CONFLICT(id) DO UPDATE SET
				action = excluded.action, "join" = excluded."join", whole_words = excluded.whole_words,
				enabled = excluded.enabled, conditions = excluded.conditions, updated_at = excluded.updated_at
		`, sql.Named("action", rule.Action), sql.Named("join", rule.Join),
			sql.Named("whole_words", boolToInt(rule.WholeWords)), sql.Named("enabled", boolToInt(enabled)),
			sql.Named("conditions", string(conditions)), sql.Named("updated_at", time.Now().Unix()))
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("save global filter: %w", err)
	}
	return s.savedGlobalFilter()
}

// SetGlobalFilterEnabled switches the global filter on or off and re-checks.
func (s *Store) SetGlobalFilterEnabled(enabled bool) (*model.GlobalFilterSaved, error) {
	err := s.inTx(func(tx *sql.Tx) error {
		result, err := tx.Exec(`UPDATE global_filter SET enabled = :enabled, updated_at = :updated_at`,
			sql.Named("enabled", boolToInt(enabled)), sql.Named("updated_at", time.Now().Unix()))
		if err != nil {
			return err
		}
		n, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if n == 0 {
			return fmt.Errorf("%w: global filter", ErrNotFound)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.savedGlobalFilter()
}

// DeleteGlobalFilter removes the filter and re-checks, so the articles only it
// hid come back. It returns every article still hidden by feed filters.
func (s *Store) DeleteGlobalFilter() (int64, error) {
	err := s.inTx(func(tx *sql.Tx) error {
		result, err := tx.Exec(`DELETE FROM global_filter`)
		if err != nil {
			return err
		}
		n, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if n == 0 {
			return fmt.Errorf("%w: global filter", ErrNotFound)
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return s.RecomputeAllFilters()
}

// savedGlobalFilter re-checks all articles after a committed change and
// returns the filter with the new total.
func (s *Store) savedGlobalFilter() (*model.GlobalFilterSaved, error) {
	total, err := s.RecomputeAllFilters()
	if err != nil {
		return nil, fmt.Errorf("re-check articles: %w", err)
	}
	f, err := s.GetGlobalFilter()
	if err != nil {
		return nil, err
	}
	return &model.GlobalFilterSaved{GlobalFilter: f, HiddenTotal: total}, nil
}

// RecomputeAllFilters re-checks the articles of every feed, one short
// transaction per feed so a pull is never blocked past busy_timeout. It
// returns how many articles are hidden afterwards.
func (s *Store) RecomputeAllFilters() (int64, error) {
	feedIDs, err := listIDs(s.db, `SELECT id FROM feeds ORDER BY id`)
	if err != nil {
		return 0, err
	}
	if err := s.recomputeFeeds(feedIDs); err != nil {
		return 0, err
	}
	var total int64
	err = s.db.QueryRow(`SELECT COUNT(*) FROM items WHERE filtered = 1`).Scan(&total)
	return total, err
}

type rowsQuerier interface {
	Query(query string, args ...any) (*sql.Rows, error)
}

// listIDs runs a query selecting one id column.
func listIDs(q rowsQuerier, query string, args ...any) ([]int64, error) {
	rows, err := q.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// recomputeFeeds re-checks each feed in its own short transaction.
func (s *Store) recomputeFeeds(feedIDs []int64) error {
	for _, id := range feedIDs {
		if err := s.RecomputeFilter(id); err != nil {
			return fmt.Errorf("feed %d: %w", id, err)
		}
	}
	return nil
}

// PreviewGlobalFilter runs a draft rule over the latest articles of all feeds
// without saving anything.
func (s *Store) PreviewGlobalFilter(rule filter.Rule) (*model.GlobalPreview, error) {
	if rule.Action != filter.ActionRemove {
		return nil, fmt.Errorf("%w: the global filter can only remove", ErrInvalid)
	}
	return s.previewLatest(rule, nil)
}

// previewLatest runs a draft rule over the latest articles of all feeds, or
// only of the folder's feeds when groupID is set.
func (s *Store) previewLatest(rule filter.Rule, groupID *int64) (*model.GlobalPreview, error) {
	m, err := filter.Compile(rule)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
	}

	where := ""
	args := []any{sql.Named("limit", globalPreviewLimit)}
	if groupID != nil {
		where = "WHERE f.group_id = :group_id"
		args = append(args, sql.Named("group_id", *groupID))
	}

	started := time.Now()
	rows, err := s.db.Query(`
		SELECT i.id, i.feed_id, f.name, i.title, i.link, i.content, i.pub_date
		FROM items i JOIN feeds f ON f.id = i.feed_id
		`+where+`
		ORDER BY i.pub_date DESC, i.id DESC
		LIMIT :limit
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	preview := &model.GlobalPreview{Items: []model.GlobalPreviewItem{}}
	for rows.Next() {
		var id, feedID, pubDate int64
		var feedName, title, link, content string
		if err := rows.Scan(&id, &feedID, &feedName, &title, &link, &content, &pubDate); err != nil {
			return nil, err
		}
		hidden := m.Hidden(NewFilterItem(m, title, link, content))
		preview.Checked++
		if hidden {
			preview.Hidden++
		}
		preview.Items = append(preview.Items, model.GlobalPreviewItem{
			ID: id, FeedID: feedID, FeedName: feedName, Title: title, PubDate: pubDate, Hidden: hidden,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	slog.Debug("latest articles filter preview", "group_id", groupID, "checked", preview.Checked, "duration", time.Since(started))
	return preview, nil
}
