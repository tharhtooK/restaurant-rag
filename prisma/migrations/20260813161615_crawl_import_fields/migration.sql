-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "dietary" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "sourceUrl" TEXT;
