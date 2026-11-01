import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/components/holdplan/workspace";

export const Route = createFileRoute("/jobs/$jobId")({ component: JobPage });

function JobPage() {
  return <Workspace />;
}
