import { NextRequest, NextResponse } from "next/server";
import { getProven } from "@/lib/proven";
import { DATA_CACHE } from "@/lib/cache-headers";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ageGroup = searchParams.get("ageGroup") || "U15";
  const gender = searchParams.get("gender") || "Boys";
  return NextResponse.json(getProven(ageGroup, gender), { headers: DATA_CACHE });
}
