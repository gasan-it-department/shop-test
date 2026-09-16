-- store image bytes in the database, so uploading needs no Admin API access
-- AlterTable
ALTER TABLE "PostImage" ADD COLUMN     "data" BYTEA,
ADD COLUMN     "contentType" TEXT;

-- url is now optional: an image is either bytes here, or a url elsewhere
ALTER TABLE "PostImage" ALTER COLUMN "url" DROP NOT NULL;
