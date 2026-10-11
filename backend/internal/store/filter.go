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

const previewItemLimit = 100

// NewFilterItem builds the matcher's view of an article. It strips the HTML
// (the same text strip_html indexes) only when the matcher reads it.
func NewFilterItem(m *filter.Matcher, title, link, content string) filter.Item {
	it := filter.Item{Title: title, Link: link, HTML: content}
	if m.NeedsText() {
		it.Text = extractVisibleText(content)
	}
	return it
}

const filterSelect = `
	SELECT f.feed_id, f.action, f."join", f.whole_words, f.enabled, f.conditions, f.updated_at,
	       (SELECT COUNT(*) FROM items i WHERE i.feed_id = f.feed_id AND i.filtered = 1)
	FROM feed_filters f
`

func scanFeedFilter(row rowScanner) (*model.FeedFilter, error) {
	f := &model.FeedFilter{}
	var wholeWords, enabled int
	var conditions string
	if err := row.Scan(&f.FeedID, &f.Action, &f.Join, &wholeWords, &enabled, &conditions, &f.UpdatedAt, &f.HiddenCount); err != nil {
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

// GetFeedFilter returns the feed's filter, or ErrNotFound when it has none.
func (s *Store) GetFeedFilter(feedID int64) (*model.FeedFilter, error) {
	f, err := scanFeedFilter(s.db.QueryRow(filterSelect+` WHERE f.feed_id = :feed_id`, sql.Named("feed_id", feedID)))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: filter", ErrNotFound)
		}
		return nil, fmt.Errorf("get feed filter: %w", err)
	}
	return f, nil
}

func (s *Store) ListFeedFilters() ([]*model.FeedFilter, error) {
	rows, err := s.db.Query(filterSelect + ` ORDER BY f.feed_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	filters := []*model.FeedFilter{}
	for rows.Next() {
		f, err := scanFeedFilter(rows)
		if err != nil {
			return nil, err
		}
		filters = append(filters, f)
	}
	return filters, rows.Err()
}

// UpsertFeedFilter saves the rule and re-checks the feed's stored articles.
func (s *Store) UpsertFeedFilter(feedID int64, rule filter.Rule, enabled bool) (*model.FeedFilter, error) {
	if err := filter.Validate(rule); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if _, err := s.GetFeed(feedID); err != nil {
		return nil, err
	}
	conditions, err := json.Marshal(rule.Conditions)
	if err != nil {
		return nil, err
	}

	err = s.inTx(func(tx *sql.Tx) error {
		if _, err := tx.Exec(`
			INSERT INTO feed_filters (feed_id, action, "join", whole_words, enabled, conditions, updated_at)
			VALUES (:feed_id, :action, :join, :whole_words, :enabled, :conditions, :updated_at)
			ON CONFLICT(feed_id) DO UPDATE SET
				action = excluded.action, "join" = excluded."join", whole_words = excluded.whole_words,
				enabled = excluded.enabled, conditions = excluded.conditions, updated_at = excluded.updated_at
		`, sql.Named("feed_id", feedID), sql.Named("action", rule.Action), sql.Named("join", rule.Join),
			sql.Named("whole_words", boolToInt(rule.WholeWords)), sql.Named("enabled", boolToInt(enabled)),
			sql.Named("conditions", string(conditions)), sql.Named("updated_at", time.Now().Unix())); err != nil {
			return err
		}
		return recomputeFilterTx(tx, feedID)
	})
	if err != nil {
		return nil, fmt.Errorf("save feed filter: %w", err)
	}
	return s.GetFeedFilter(feedID)
}

// SetFeedFilterEnabled switches the whole filter on or off and re-checks.
func (s *Store) SetFeedFilterEnabled(feedID int64, enabled bool) (*model.FeedFilter, error) {
	err := s.inTx(func(tx *sql.Tx) error {
		result, err := tx.Exec(`UPDATE feed_filters SET enabled = :enabled, updated_at = :updated_at WHERE feed_id = :feed_id`,
			sql.Named("enabled", boolToInt(enabled)), sql.Named("updated_at", time.Now().Unix()), sql.Named("feed_id", feedID))
		if err != nil {
			return err
		}
		n, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if n == 0 {
			return fmt.Errorf("%w: filter", ErrNotFound)
		}
		return recomputeFilterTx(tx, feedID)
	})
	if err != nil {
		return nil, err
	}
	return s.GetFeedFilter(feedID)
}

// DeleteFeedFilter removes the filter; the feed's hidden articles come back.
func (s *Store) DeleteFeedFilter(feedID int64) error {
	return s.inTx(func(tx *sql.Tx) error {
		result, err := tx.Exec(`DELETE FROM feed_filters WHERE feed_id = :feed_id`, sql.Named("feed_id", feedID))
		if err != nil {
			return err
		}
		n, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if n == 0 {
			return fmt.Errorf("%w: filter", ErrNotFound)
		}
		return recomputeFilterTx(tx, feedID)
	})
}

// RecomputeFilter sets items.filtered on every item of the feed (all 0 when
// the feed has no filter or it is off).
func (s *Store) RecomputeFilter(feedID int64) error {
	return s.inTx(func(tx *sql.Tx) error { return recomputeFilterTx(tx, feedID) })
}

func (s *Store) inTx(fn func(tx *sql.Tx) error) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

// activeMatcher returns the compiled filter, or nil when the feed has no
// filter or it is off.
func activeMatcher(q interface {
	QueryRow(query string, args ...any) *sql.Row
}, feedID int64) (*filter.Matcher, error) {
	var action, join, conditions string
	var wholeWords int
	err := q.QueryRow(`
		SELECT action, "join", whole_words, conditions FROM feed_filters
		WHERE feed_id = :feed_id AND enabled = 1
	`, sql.Named("feed_id", feedID)).Scan(&action, &join, &wholeWords, &conditions)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	rule := filter.Rule{Action: action, Join: join, WholeWords: intToBool(wholeWords)}
	if err := json.Unmarshal([]byte(conditions), &rule.Conditions); err != nil {
		return nil, fmt.Errorf("decode filter conditions: %w", err)
	}
	return filter.Compile(rule)
}

func recomputeFilterTx(tx *sql.Tx, feedID int64) error {
	// Take the write lock before reading, so a pull that inserts items meanwhile
	// cannot make the later UPDATEs fail on a stale snapshot.
	if _, err := tx.Exec(`UPDATE feed_filters SET updated_at = updated_at WHERE feed_id = :feed_id`, sql.Named("feed_id", feedID)); err != nil {
		return err
	}
	m, err := activeMatcher(tx, feedID)
	if err != nil {
		return err
	}
	if m == nil {
		_, err := tx.Exec(`UPDATE items SET filtered = 0 WHERE feed_id = :feed_id AND filtered != 0`, sql.Named("feed_id", feedID))
		return err
	}

	rows, err := tx.Query(`SELECT id, title, link, content, filtered FROM items WHERE feed_id = :feed_id`, sql.Named("feed_id", feedID))
	if err != nil {
		return err
	}
	type change struct {
		id     int64
		hidden int
	}
	var changes []change
	for rows.Next() {
		var id int64
		var title, link, content string
		var current int
		if err := rows.Scan(&id, &title, &link, &content, &current); err != nil {
			rows.Close()
			return err
		}
		want := boolToInt(m.Hidden(NewFilterItem(m, title, link, content)))
		if want != current {
			changes = append(changes, change{id, want})
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	stmt, err := tx.Prepare(`UPDATE items SET filtered = :filtered WHERE id = :id`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, c := range changes {
		if _, err := stmt.Exec(sql.Named("filtered", c.hidden), sql.Named("id", c.id)); err != nil {
			return err
		}
	}
	return nil
}

// MarkFilteredInputs sets Filtered on new articles about to be saved, using
// the feed's current filter. Without a filter it changes nothing.
func (s *Store) MarkFilteredInputs(feedID int64, inputs []BatchCreateItemInput) error {
	m, err := activeMatcher(s.db, feedID)
	if err != nil || m == nil {
		return err
	}
	for i, in := range inputs {
		inputs[i].Filtered = m.Hidden(NewFilterItem(m, in.Title, in.Link, in.Content))
	}
	return nil
}

// PreviewFilter runs a draft rule over every stored article of the feed
// without saving anything, and lists the latest ones with their verdict.
func (s *Store) PreviewFilter(feedID int64, rule filter.Rule) (*model.FilterPreview, error) {
	m, err := filter.Compile(rule)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if _, err := s.GetFeed(feedID); err != nil {
		return nil, err
	}

	started := time.Now()
	rows, err := s.db.Query(`
		SELECT id, title, link, content, pub_date FROM items
		WHERE feed_id = :feed_id
		ORDER BY pub_date DESC, id DESC
	`, sql.Named("feed_id", feedID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	preview := &model.FilterPreview{Items: []model.FilterPreviewItem{}}
	for rows.Next() {
		var id, pubDate int64
		var title, link, content string
		if err := rows.Scan(&id, &title, &link, &content, &pubDate); err != nil {
			return nil, err
		}
		hidden := m.Hidden(NewFilterItem(m, title, link, content))
		preview.Checked++
		if hidden {
			preview.Hidden++
		}
		if len(preview.Items) < previewItemLimit {
			preview.Items = append(preview.Items, model.FilterPreviewItem{ID: id, Title: title, PubDate: pubDate, Hidden: hidden})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	slog.Debug("filter preview", "feed_id", feedID, "checked", preview.Checked, "duration", time.Since(started))
	return preview, nil
}
