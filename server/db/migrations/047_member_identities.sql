ALTER TABLE user_profiles
  ADD COLUMN member_role text NOT NULL DEFAULT 'student' CHECK (member_role IN ('teacher', 'student')),
  ADD COLUMN degrees text[] NOT NULL DEFAULT '{}' CHECK (
    degrees = array_remove(ARRAY[
      CASE WHEN 'phd' = ANY(degrees) THEN 'phd' END,
      CASE WHEN 'master' = ANY(degrees) THEN 'master' END,
      CASE WHEN 'undergrad' = ANY(degrees) THEN 'undergrad' END
    ], NULL)
  );

UPDATE user_profiles SET
  member_role = CASE WHEN degree_level IN ('faculty', 'postdoc') THEN 'teacher' ELSE 'student' END,
  degrees = CASE
    WHEN degree_level = 'postdoc' THEN ARRAY['phd']
    WHEN degree_level IN ('phd', 'master', 'undergrad') THEN ARRAY[degree_level]
    ELSE ARRAY[]::text[]
  END;

DO $$
BEGIN
  IF EXISTS (SELECT FROM users WHERE status='active' AND base_tier='super')
    AND NOT EXISTS (SELECT FROM users WHERE status='active' AND base_tier='super'
      AND (account_kind='person' OR username='admin')) THEN
    RAISE EXCEPTION 'Retiring legacy system accounts would remove the last active administrator';
  END IF;
END
$$;

UPDATE users SET status='disabled', updated_at=now()
WHERE account_kind='system' AND username <> 'admin' AND status <> 'disabled';

DELETE FROM session_tokens s USING users u
WHERE s.user_id=u.id AND u.account_kind='system' AND u.username <> 'admin';

ALTER TABLE users ADD CONSTRAINT retired_system_account_disabled
  CHECK (account_kind <> 'system' OR username='admin' OR status='disabled');
