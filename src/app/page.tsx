import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "There's nothing here at the moment.",
  description: "There's nothing here at the moment.",
};

export default function Home() {
  return (
    <main className={styles.page}>
      <h1 className={styles.message}>
        There&apos;s nothing here at the moment.
      </h1>
    </main>
  );
}
