import type { Metadata } from "next";
import BingoBoard from "./BingoBoard";

export const metadata: Metadata = {
  title: "People Bingo — Arafat Rais",
  description:
    "A phone-friendly people bingo card for meeting new people. Find someone who fits a prompt and add their name.",
};

export default function BingoPage() {
  return <BingoBoard />;
}
