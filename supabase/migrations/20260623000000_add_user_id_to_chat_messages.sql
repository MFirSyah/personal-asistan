-- 1. Add user_id column to app_chat_messages
ALTER TABLE app_chat_messages 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE;

-- 2. Drop existing policies on app_chat_messages
DROP POLICY IF EXISTS "Lihat pesan sesuai konteks" ON app_chat_messages;
DROP POLICY IF EXISTS "Kirim pesan sesuai konteks" ON app_chat_messages;

-- 3. Re-create "Lihat pesan sesuai konteks" policy
CREATE POLICY "Lihat pesan sesuai konteks" ON app_chat_messages
    FOR SELECT USING (
        (room_id IS NULL AND user_id = auth.uid())
        OR
        (room_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM app_room_members m
            WHERE m.room_id = app_chat_messages.room_id AND m.user_id = auth.uid()
        ))
    );

-- 4. Re-create "Kirim pesan sesuai konteks" policy
CREATE POLICY "Kirim pesan sesuai konteks" ON app_chat_messages
    FOR INSERT WITH CHECK (
        (room_id IS NULL AND user_id = auth.uid() AND sender_id = auth.uid())
        OR
        (room_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM app_room_members m
            WHERE m.room_id = app_chat_messages.room_id AND m.user_id = auth.uid()
        ) AND sender_id = auth.uid())
    );
