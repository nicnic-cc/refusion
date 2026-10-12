package store

import "database/sql"

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullStringPtr(n sql.NullString) *string {
	if !n.Valid {
		return nil
	}
	return &n.String
}
