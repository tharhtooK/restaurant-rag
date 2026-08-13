-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "dataset" TEXT NOT NULL DEFAULT 'seed';

-- CreateIndex
CREATE INDEX "Restaurant_dataset_idx" ON "Restaurant"("dataset");

-- The DEFAULT above is wrong for rows already imported by a crawl, which would
-- otherwise be labelled 'seed' and stay visible to the eval. Crawled restaurants
-- are identifiable by their review source: import-crawl.ts writes 'crawled:<source>'.
--
-- A crawled restaurant with no reviews at all would be missed here. None exists
-- at the time of writing; verify after applying rather than assuming:
--   SELECT neighborhood, dataset, count(*) FROM "Restaurant" GROUP BY 1,2 ORDER BY 1;
UPDATE "Restaurant" SET "dataset" = 'crawled'
WHERE "id" IN (
  SELECT DISTINCT "restaurantId" FROM "Review" WHERE "source" LIKE 'crawled:%'
);
