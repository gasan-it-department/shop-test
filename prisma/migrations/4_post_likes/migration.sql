-- Reaction was created by 0_init and then never read or written: no code path
-- ever inserted a row. This migration gives it the shop scope and the member
-- foreign key every other table here has.
--
-- Adding a NOT NULL column without a default only works on an empty table, so
-- the DELETE states that assumption instead of leaving it implicit. If a row
-- did somehow exist it would be a like nobody could see, attached to a member
-- the schema could not cascade.
DELETE FROM "Reaction";

ALTER TABLE "Reaction" ADD COLUMN "shopId" TEXT NOT NULL;

ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- without this a redacted or deleted member left their hearts behind, counted
-- but unattributable
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Reaction_postId_emoji_idx" ON "Reaction"("postId", "emoji");
CREATE INDEX "Reaction_memberId_idx" ON "Reaction"("memberId");
CREATE INDEX "Reaction_shopId_idx" ON "Reaction"("shopId");
