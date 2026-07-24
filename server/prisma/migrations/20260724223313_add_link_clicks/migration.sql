-- CreateTable
CREATE TABLE "LinkClick" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewerId" TEXT,

    CONSTRAINT "LinkClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinkClick_restaurantId_clickedAt_idx" ON "LinkClick"("restaurantId", "clickedAt");

-- AddForeignKey
ALTER TABLE "LinkClick" ADD CONSTRAINT "LinkClick_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkClick" ADD CONSTRAINT "LinkClick_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
