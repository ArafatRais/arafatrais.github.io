import type { Metadata } from "next";
import TutoringBoard from "./TutoringBoard";

export const metadata: Metadata = {
  title: "Live tutoring board — Arafat Rais",
  description:
    "A local-first PDF annotation workspace for live tutoring sessions.",
};

export default function TutoringPage() {
  return <TutoringBoard />;
}
