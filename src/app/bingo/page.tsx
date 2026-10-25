import type { Metadata } from "next";
import { Instrument_Serif, Space_Grotesk, Space_Mono } from "next/font/google";
import BingoBoard from "./BingoBoard";

const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });
const mono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono-label",
});
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif-italic",
});

export const metadata: Metadata = {
  title: "Networking Bingo",
  description:
    "Networking bingo for the Imperial College MedTech Society. Find someone who fits a prompt and add their name.",
};

export default function BingoPage() {
  return (
    <BingoBoard fontClass={`${grotesk.variable} ${mono.variable} ${serif.variable}`} />
  );
}
