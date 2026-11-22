import { createFileRoute } from "@tanstack/react-router";
import { Courses } from "./courses.index";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Courses — Math & Finance Pro" },
      { name: "description", content: "Explore courses by subject and learn at your own pace." },
    ],
  }),
  component: Home,
});
function Home() {
  return <Courses />;
}
