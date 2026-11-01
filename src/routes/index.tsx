import { createFileRoute } from "@tanstack/react-router";
import { JobsHome } from "@/components/holdplan/jobs-home";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <JobsHome />;
}
