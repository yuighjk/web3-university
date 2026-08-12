-- Migration: 0001_create_tables
-- 课程表
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY,
  course_id INTEGER UNIQUE NOT NULL,        -- 与链上 courseId 一致
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  video_urls TEXT NOT NULL,                  -- JSON array string
  content_hash TEXT NOT NULL,               -- keccak256，与链上一致
  status TEXT DEFAULT 'pending',            -- pending / published / delisted
  provider_address TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  user_address TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES courses(course_id)
);

-- 用户资料表
CREATE TABLE IF NOT EXISTS users (
  address TEXT PRIMARY KEY,
  username TEXT,
  avatar_url TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 学习进度表
CREATE TABLE IF NOT EXISTS progress (
  user_address TEXT NOT NULL,
  course_id INTEGER NOT NULL,
  progress INTEGER DEFAULT 0,               -- 0-100
  completed_at DATETIME,
  PRIMARY KEY (user_address, course_id)
);

-- 索引：高频查询字段
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_provider ON courses(provider_address);
CREATE INDEX IF NOT EXISTS idx_comments_course_id ON comments(course_id);
CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_address);
