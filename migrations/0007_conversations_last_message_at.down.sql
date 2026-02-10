-- Drop index and columns and trigger for last_message_at/first_user_message_at
DROP INDEX IF EXISTS idx_conv_last_message_at;
DROP TRIGGER IF EXISTS trg_messages_touch_conversation_times ON messages;
DROP FUNCTION IF EXISTS touch_conversation_message_times();
ALTER TABLE conversations DROP COLUMN IF EXISTS first_user_message_at;
ALTER TABLE conversations DROP COLUMN IF EXISTS last_message_at;
