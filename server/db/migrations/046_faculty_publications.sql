ALTER TABLE research_items
  ADD COLUMN faculty_confirmed boolean NOT NULL DEFAULT false;

ALTER TABLE research_item_authors
  ADD COLUMN member_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX research_item_authors_member_idx
  ON research_item_authors(member_user_id) WHERE member_user_id IS NOT NULL;
