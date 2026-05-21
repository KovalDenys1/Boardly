-- AddColumn Users: bio, accentColor, featuredGame
ALTER TABLE "Users" ADD COLUMN "bio" TEXT;
ALTER TABLE "Users" ADD COLUMN "accentColor" TEXT;
ALTER TABLE "Users" ADD COLUMN "featuredGame" TEXT;

-- AddColumn Lobbies: theme
ALTER TABLE "Lobbies" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'default';
