import { NextResponse } from "next/server";
import { listChatsPageByUser } from "@/lib/db/queries";
import { getServerViewer } from "@/lib/session";

export async function GET() {
  const viewer = await getServerViewer();
  const initialChatsPage = viewer
    ? await listChatsPageByUser(viewer.id)
    : { items: [], nextCursor: null };

  return NextResponse.json({
    chats: initialChatsPage.items,
    nextCursor: initialChatsPage.nextCursor,
    viewer,
  });
}
