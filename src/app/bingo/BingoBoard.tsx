"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import styles from "./page.module.css";

const prompts = [
  "Is interested in neuroprosthetics or brain–computer interfaces",
  "Was born in December",
  "Wants to work in surgical robotics",
  "Speaks 3 or more languages",
  "Has tried a VR headset",
  "Has never broken a bone",
  "Wants to start their own medtech company",
  "Is left-handed",
  "Wears a smartwatch or fitness tracker",
  "Has a pet at home",
  "Has been to an Imperial MedTech speaker series talk or workshop",
  "Was born outside the UK",
  "Free space",
  "Has taken part in a MedTech hackathon or IC HealthHack",
  "Has run a 5K or longer",
  "Has an idea for a medical device they’d build",
  "Plays a musical instrument",
  "Is a medic who’d love to work with engineers",
  "Can touch their nose with their tongue",
  "Has used the Imperial Hackspace or a 3D printer",
  "Has been to more than 10 countries",
  "Has done research in an Imperial lab",
  "Has the same initials as a famous person",
  "Is studying outside medicine or bioengineering, but still loves medtech",
  "Is an only child",
];

const freeId = 13;
const storageKey = "medtech-bingo-matches-v1";
type Matches = Record<number, string>;

function hasBingo(matches: Matches) {
  const isMatched = (id: number) => id === freeId || Boolean(matches[id]?.trim());
  const cell = (row: number, column: number) => row * 5 + column + 1;

  // Five columns by five rows: a bingo is any full row, column or diagonal.
  const lines: number[][] = [];
  for (let i = 0; i < 5; i += 1) {
    lines.push(Array.from({ length: 5 }, (_, j) => cell(i, j)));
    lines.push(Array.from({ length: 5 }, (_, j) => cell(j, i)));
  }
  lines.push(Array.from({ length: 5 }, (_, i) => cell(i, i)));
  lines.push(Array.from({ length: 5 }, (_, i) => cell(i, 4 - i)));

  return lines.some((line) => line.every(isMatched));
}

export default function BingoBoard({ fontClass }: { fontClass: string }) {
  const [matches, setMatches] = useState<Matches>({});
  const [isReady, setIsReady] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [bingoDismissed, setBingoDismissed] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const activeTileRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let isMounted = true;
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const validMatches: Matches = {};
            for (const [key, value] of Object.entries(
              parsed as Record<string, unknown>,
            )) {
              const id = Number(key);
              if (
                Number.isInteger(id) &&
                id > 0 &&
                id !== freeId &&
                id <= prompts.length &&
                typeof value === "string" &&
                value.trim()
              ) {
                validMatches[id] = value.trim().slice(0, 48);
              }
            }
            if (isMounted) setMatches(validMatches);
          }
        }
      } catch {
        // A blocked or malformed local-storage value should not stop the game.
      }
      if (isMounted) setIsReady(true);
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(matches));
    } catch {
      // The current game remains usable if this browser cannot save locally.
    }
  }, [isReady, matches]);

  useEffect(() => {
    if (activeId === null) return;
    nameInputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveId(null);
        window.setTimeout(() => activeTileRef.current?.focus(), 0);
        return;
      }

      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeId]);

  const activePrompt = activeId === null ? null : prompts[activeId - 1];
  const completedCount = Object.entries(matches).filter(
    ([id, value]) => Number(id) !== freeId && value.trim(),
  ).length;
  const bingo = hasBingo(matches);

  function closeEditor() {
    setActiveId(null);
    window.setTimeout(() => activeTileRef.current?.focus(), 0);
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (activeId === null || !trimmedName) return;
    setMatches((current) => ({ ...current, [activeId]: trimmedName }));
    closeEditor();
  }

  function clearName() {
    if (activeId === null) return;
    setMatches((current) => {
      const next = { ...current };
      delete next[activeId];
      return next;
    });
    setBingoDismissed(false);
    closeEditor();
  }

  function clearBoard() {
    if (!completedCount) return;
    if (!window.confirm("Clear all names from this bingo card?")) return;
    setMatches({});
    setBingoDismissed(false);
  }

  return (
    <main className={`${styles.page} ${fontClass}`}>
      <div className={styles.container}>
        <header className={styles.topbar}>
          <Link className={styles.wordmark} href="/" aria-label="Back to tools">
            <span className={styles.wordmarkIcon} aria-hidden="true">
              ✳
            </span>
            <span>MEDTECH SOCIETY</span>
          </Link>
          <Link className={styles.backLink} href="/">
            <span aria-hidden="true">←</span> All tools
          </Link>
        </header>

        <section className={styles.hero} aria-labelledby="bingo-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Imperial College MedTech Society presents</p>
            <h1 id="bingo-title">
              Human <span>Bingo</span>
            </h1>
            <p className={styles.intro}>
              Meet fellow members, find someone who fits a clue and add their name.
              Get five in a row to win.
            </p>
          </div>
          <aside className={styles.scoreCard} aria-label="Your progress">
            <span className={styles.scoreLabel}>NAMES FOUND</span>
            <strong aria-live="polite">
              {completedCount}<span> / 24</span>
            </strong>
            <span className={styles.scoreNote}>names found so far</span>
          </aside>
        </section>

        <section className={styles.board} id="board" aria-labelledby="board-title">
          <div className={styles.boardHeading}>
            <div>
              <p className={styles.boardEyebrow}>The challenge</p>
              <h2 id="board-title">Find someone who…</h2>
            </div>
            <button
              className={styles.clearButton}
              type="button"
              onClick={clearBoard}
              disabled={!completedCount}
            >
              Clear board
            </button>
          </div>

          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="Bingo card progress"
            aria-valuemin={0}
            aria-valuemax={prompts.length - 1}
            aria-valuenow={completedCount}
          >
            <span
              className={styles.progressFill}
              style={{ width: `${(completedCount / (prompts.length - 1)) * 100}%` }}
            />
          </div>

          <p className={styles.swipeHint} aria-hidden="true">
            Swipe sideways to see all five columns →
          </p>

          <div
            className={styles.grid}
            role="group"
            aria-label="25 human bingo squares"
          >
            {prompts.map((prompt, index) => {
              const id = index + 1;
              const matchedName = matches[id];
              const isFreeSpace = prompt === "Free space";
              return (
                <button
                  className={`${styles.tile} ${matchedName ? styles.tileMatched : ""} ${isFreeSpace ? styles.tileFree : ""}`}
                  key={prompt}
                  type="button"
                  aria-pressed={isFreeSpace || Boolean(matchedName)}
                  disabled={isFreeSpace}
                  aria-label={`${prompt}${matchedName ? ` — matched with ${matchedName}` : " — add a name"}`}
                  onClick={(event) => {
                    activeTileRef.current = event.currentTarget;
                    setActiveId(id);
                    setName(matchedName ?? "");
                  }}
                >
                  <span className={styles.tileNumber}>
                    {String(id).padStart(2, "0")}
                    {isFreeSpace && <span className={styles.freeTag}>FREE</span>}
                  </span>
                  <span className={styles.tilePrompt}>
                    {isFreeSpace ? "FREE" : prompt}
                  </span>
                  <span className={styles.tileFooter}>
                    {matchedName ? (
                      <>
                        <span className={styles.checkMark} aria-hidden="true">
                          ✓
                        </span>
                        <span className={styles.matchedName}>{matchedName}</span>
                      </>
                    ) : isFreeSpace ? (
                      <span className={styles.tapHint}>Free pizza!</span>
                    ) : (
                      <span className={styles.tapHint}>Tap to add a name</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <footer className={styles.boardFooter}>
            <span>Tue 27 Oct · RSM G41 · Free pizza!</span>
            <span>Names save on this device only</span>
          </footer>
        </section>

        <footer className={styles.pageFooter}>
          <span>Say hello. Pitch your first idea.</span>
          <span>INTRO TO MEDTECH · 2026</span>
        </footer>
      </div>

      {bingo && !bingoDismissed && (
        <div
          className={styles.bingoOverlay}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="bingo-win-title"
        >
          <span className={styles.bingoStar} aria-hidden="true">
            ✦
          </span>
          <p className={styles.bingoEyebrow}>You completed a line</p>
          <h2 id="bingo-win-title">
            <span>Bingo!</span>
          </h2>
          <p className={styles.bingoCopy}>
            Five names in a row. Keep going to fill the rest of the board.
          </p>
          <button
            className={styles.bingoButton}
            type="button"
            autoFocus
            onClick={() => setBingoDismissed(true)}
          >
            Keep playing
          </button>
        </div>
      )}

      {activePrompt && activeId !== null && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <section
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            aria-describedby="dialog-prompt"
          >
            <div className={styles.dialogTopline}>
              <span className={styles.dialogEyebrow}>YOU FOUND SOMEONE WHO…</span>
              <button
                className={styles.closeButton}
                type="button"
                onClick={closeEditor}
                aria-label="Close name entry"
              >
                ×
              </button>
            </div>
            <h2 id="dialog-title">Add a name</h2>
            <p id="dialog-prompt" className={styles.dialogPrompt}>
              {activePrompt}
            </p>
            <form className={styles.nameForm} onSubmit={saveName}>
              <label htmlFor="person-name">Who did you meet?</label>
              <input
                ref={nameInputRef}
                id="person-name"
                name="person-name"
                type="text"
                autoComplete="off"
                maxLength={48}
                placeholder="Type their name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <div className={styles.dialogActions}>
                {matches[activeId] ? (
                  <button
                    className={styles.removeButton}
                    type="button"
                    onClick={clearName}
                  >
                    Remove name
                  </button>
                ) : (
                  <span />
                )}
                <button
                  className={styles.cancelButton}
                  type="button"
                  onClick={closeEditor}
                >
                  Cancel
                </button>
                <button
                  className={styles.saveButton}
                  type="submit"
                  disabled={!name.trim()}
                >
                  Save name
                </button>
              </div>
            </form>
            <p className={styles.privacyNote}>
              Your names stay in this browser on this device.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
