import { NextResponse } from "next/server";
import { getChatForUser } from "@/lib/db/queries";
import { getServerViewer } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const viewer = await getServerViewer();
  if (!viewer) {
    return NextResponse.json({ chat: null }, { status: 401 });
  }

  const { id } = await params;
  const chat = await getChatForUser(id, viewer.id);

  if (!chat) {
    return NextResponse.json({ chat: null }, { status: 404 });
  }

  return NextResponse.json({ chat });
}
