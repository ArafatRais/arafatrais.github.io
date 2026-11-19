import type { Metadata } from "next";
import AnatomyStudio from "./AnatomyStudio";

export const metadata: Metadata = {
  title: "Anatomy Spotter",
  description:
    "Free 3D anatomy practice: explore BodyParts3D models, name highlighted structures, and find structures on the model like a spotter exam.",
};

export default function AnatomyPage() {
  return <AnatomyStudio />;
}
