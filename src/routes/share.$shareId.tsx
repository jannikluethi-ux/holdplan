import { createFileRoute } from "@tanstack/react-router";
import { ShareView } from "@/components/holdplan/share-view";

export const Route = createFileRoute("/share/$shareId")({ component: SharePage });

function SharePage() {
  return <ShareView />;
}
