-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "state" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "neighborhood" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Restaurant_city_idx" ON "Restaurant"("city");

-- CreateIndex
CREATE INDEX "Restaurant_state_idx" ON "Restaurant"("state");

-- Every row predating this migration is NYC: the 20 seeded restaurants across the
-- five graded neighborhoods, plus Bushwick, Greenpoint and Red Hook from early
-- crawls. The boroughs are folded into "New York" deliberately - the dataset was
-- conceived as one city with five neighborhoods, and the goldens filter on
-- neighborhood, so splitting boroughs into separate cities here would buy nothing
-- and would make the seeded corpus inconsistent with itself.
UPDATE "Restaurant" SET "city" = 'New York', "state" = 'NY' WHERE "city" = '';
