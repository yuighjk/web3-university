-- Certificate requests table
CREATE TABLE IF NOT EXISTS certificate_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_address TEXT NOT NULL,
  course_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Provider applications table
CREATE TABLE IF NOT EXISTS provider_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  introduction TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
