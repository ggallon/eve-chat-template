import { NextResponse } from "next/server";
import { listMemoryForUser } from "@/lib/memory/queries";
import { getServerViewer } from "@/lib/session";

export async function GET() {
  const viewer = await getServerViewer();
  if (!viewer) {
    return NextResponse.json({ chat: null }, { status: 401 });
  }

  const memory = await listMemoryForUser(viewer.id);
  return NextResponse.json({ memory });
}
