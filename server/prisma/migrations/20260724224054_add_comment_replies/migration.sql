-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "answered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isReply" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Comment_postId_isReply_answered_idx" ON "Comment"("postId", "isReply", "answered");
