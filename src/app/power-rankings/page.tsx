import { redirect } from "next/navigation";

/** Power Rankings were replaced by Proven rankings (2026-11-19); old links land there. */
export default function PowerRankingsPage() {
  redirect("/proven");
}
