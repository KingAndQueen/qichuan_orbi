-- Add last_message_at to conversations and trigger to update it on message insert
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
-- optional: first_user_message_at to track first user message time
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_user_message_at TIMESTAMPTZ;

-- Function to update last_message_at and first_user_message_at
CREATE OR REPLACE FUNCTION touch_conversation_message_times()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
    SET last_message_at = COALESCE(NEW.created_at, NOW()),
        first_user_message_at = CASE
          WHEN NEW.role = 'user' AND first_user_message_at IS NULL THEN COALESCE(NEW.created_at, NOW())
          ELSE first_user_message_at
        END
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on messages insert
DROP TRIGGER IF EXISTS trg_messages_touch_conversation_times ON messages;
CREATE TRIGGER trg_messages_touch_conversation_times
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION touch_conversation_message_times();

-- Index to support sorting/filtering by last_message_at
CREATE INDEX IF NOT EXISTS idx_conv_last_message_at ON conversations (last_message_at DESC);
