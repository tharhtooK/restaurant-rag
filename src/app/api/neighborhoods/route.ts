import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const rows = await prisma.restaurant.findMany({
    distinct: ["neighborhood"],
    select: { neighborhood: true },
    orderBy: { neighborhood: "asc" },
  });

  return NextResponse.json({ neighborhoods: rows.map((row) => row.neighborhood) });
}