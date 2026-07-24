-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Business_isRestaurant_latitude_longitude_idx" ON "Business"("isRestaurant", "latitude", "longitude");
