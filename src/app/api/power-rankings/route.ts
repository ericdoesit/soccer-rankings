import { NextRequest, NextResponse } from "next/server";
import { getPowerRankings } from "@/lib/data";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ageGroup = searchParams.get("ageGroup") || undefined;
  const gender = searchParams.get("gender") || undefined;

  const rankings = getPowerRankings({ ageGroup, gender });
  return NextResponse.json(rankings);
}
