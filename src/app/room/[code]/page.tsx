import { RoomLobby } from "@/components/room/RoomLobby";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomLobby roomCode={code} />;
}
