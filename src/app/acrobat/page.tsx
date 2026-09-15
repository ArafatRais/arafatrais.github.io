import type { Metadata } from "next";
import AcrobatEditor from "./AcrobatEditor";

export const metadata: Metadata = {
  title: "AeroPDF — Free PDF editor",
  description:
    "A private, browser-based PDF editor for macOS-style document work.",
};

export default function AcrobatPage() {
  return <AcrobatEditor />;
}
