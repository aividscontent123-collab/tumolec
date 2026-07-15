import { LikedScreen } from "@/components/room/LikedScreen";

export default async function LikedPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <LikedScreen roomCode={code} />;
}
