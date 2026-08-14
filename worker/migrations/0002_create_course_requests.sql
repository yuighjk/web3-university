-- Creator submissions awaiting Owner review.
CREATE TABLE IF NOT EXISTS course_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  certificate_name TEXT NOT NULL,
  video_url TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  provider_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_course_requests_provider
  ON course_requests(provider_address);
CREATE INDEX IF NOT EXISTS idx_course_requests_status
  ON course_requests(status);
