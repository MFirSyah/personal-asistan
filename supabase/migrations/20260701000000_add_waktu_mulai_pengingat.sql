-- Migration: Add waktu_mulai and pengingat columns to todo_lists
-- Date: 2026-07-01
-- Purpose: Support for new task attributes requested via AI chat

-- Add waktu_mulai (start time) column
ALTER TABLE todo_lists ADD COLUMN IF NOT EXISTS waktu_mulai TIMESTAMP WITH TIME ZONE;

-- Add pengingat (reminder) column
ALTER TABLE todo_lists ADD COLUMN IF NOT EXISTS pengingat TIMESTAMP WITH TIME ZONE;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_todo_lists_waktu_mulai ON todo_lists(waktu_mulai);
CREATE INDEX IF NOT EXISTS idx_todo_lists_pengingat ON todo_lists(pengingat);

-- Add comment for documentation
COMMENT ON COLUMN todo_lists.waktu_mulai IS 'Waktu mulai aktivitas/tugas (sesuai request AI chat)';
COMMENT ON COLUMN todo_lists.pengingat IS 'Pengingat waktu untuk tugas (sesuai request AI chat)';
