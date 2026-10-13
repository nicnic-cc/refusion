package store

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/0x2E/fusion/internal/model"
)

// MaxFeedWebCSSBytes caps one feed's CSS (and the ?css= preview draft).
const MaxFeedWebCSSBytes = 32 << 10

// GetFeedWebCSS returns the feed's CSS, or ErrNotFound when it has none.
func (s *Store) GetFeedWebCSS(feedID int64) (*model.FeedWebCSS, error) {
	row := &model.FeedWebCSS{}
	err := s.db.QueryRow(`SELECT feed_id, css, updated_at FROM feed_web_css WHERE feed_id = :feed_id`,
		sql.Named("feed_id", feedID)).Scan(&row.FeedID, &row.CSS, &row.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: feed css", ErrNotFound)
		}
		return nil, fmt.Errorf("get feed css: %w", err)
	}
	return row, nil
}

func (s *Store) ListFeedWebCSS() ([]*model.FeedWebCSS, error) {
	rows, err := s.db.Query(`SELECT feed_id, css, updated_at FROM feed_web_css ORDER BY feed_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []*model.FeedWebCSS{}
	for rows.Next() {
		row := &model.FeedWebCSS{}
		if err := rows.Scan(&row.FeedID, &row.CSS, &row.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, row)
	}
	return list, rows.Err()
}

func (s *Store) UpsertFeedWebCSS(feedID int64, css string) (*model.FeedWebCSS, error) {
	if len(css) > MaxFeedWebCSSBytes {
		return nil, fmt.Errorf("%w: css is larger than %d bytes", ErrInvalid, MaxFeedWebCSSBytes)
	}
	if _, err := s.GetFeed(feedID); err != nil {
		return nil, err
	}
	if _, err := s.db.Exec(`
		INSERT INTO feed_web_css (feed_id, css, updated_at) VALUES (:feed_id, :css, :updated_at)
		ON CONFLICT(feed_id) DO UPDATE SET css = excluded.css, updated_at = excluded.updated_at
	`, sql.Named("feed_id", feedID), sql.Named("css", css), sql.Named("updated_at", time.Now().Unix())); err != nil {
		return nil, fmt.Errorf("save feed css: %w", err)
	}
	return s.GetFeedWebCSS(feedID)
}

// DeleteFeedWebCSS is idempotent: deleting a feed's missing CSS is not an error.
func (s *Store) DeleteFeedWebCSS(feedID int64) error {
	_, err := s.db.Exec(`DELETE FROM feed_web_css WHERE feed_id = :feed_id`, sql.Named("feed_id", feedID))
	return err
}
