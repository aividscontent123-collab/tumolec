import { Suspense } from "react";
import { RoomExploreScreen } from "@/components/room/RoomExploreScreen";

export default async function ExplorePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <Suspense fallback={null}>
      <RoomExploreScreen roomCode={code} />
    </Suspense>
  );
}
