"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import styles from "./page.module.css";

const prompts = [
  "Done umrah",
  "Hafiz",
  "Speaks Arabic",
  "Speaks Urdu",
  "Can cook a traditional meal from scratch",
  "Signed up for IGym/Ethos",
  "Is the youngest sibling",
  "Listens to halal beats while studying",
  "Has been locked out of their accom room already",
  "Has a pet",
  "Brought a console to accom",
  "Grew up in the Middle East",
  "Already has ID access to the prayer room",
  "Went to Brampton Manor",
  "Can play a musical instrument",
  "Plays or used to play FIFA like it’s a job",
  "Has a driver’s licence",
  "Still hasn’t unpacked",
  "Been to any South Kensington museum",
  "Can recommend a good place to eat near campus",
  "Been to a Premier League game",
  "Doesn’t study medicine or engineering",
  "Been on TV",
  "Been to a different continent this year",
  "Has lived in more than one city",
  "Has a sibling at Imperial",
  "Has gotten lost on campus",
  "Doesn’t drink coffee or tea",
  "Free space",
  "Loves late-night conversations",
];

const storageKey = "people-bingo-matches-v1";
type Matches = Record<number, string>;

function hasBingo(matches: Matches) {
  const isMatched = (id: number) => Boolean(matches[id]?.trim());

  // Six columns by five rows: a bingo is any run of five named tiles.
  for (let row = 0; row < 5; row += 1) {
    for (let startColumn = 0; startColumn < 2; startColumn += 1) {
      if (
        Array.from({ length: 5 }, (_, offset) =>
          isMatched(row * 6 + startColumn + offset + 1),
        ).every(Boolean)
      ) {
        return true;
      }
    }
  }

  for (let column = 0; column < 6; column += 1) {
    if (
      Array.from({ length: 5 }, (_, row) => isMatched(row * 6 + column + 1)).every(
        Boolean,
      )
    ) {
      return true;
    }
  }

  for (const [startColumn, direction] of [
    [0, 1],
    [1, 1],
    [4, -1],
    [5, -1],
  ] as const) {
    if (
      Array.from({ length: 5 }, (_, row) =>
        isMatched(row * 6 + startColumn + direction * row + 1),
      ).every(Boolean)
    ) {
      return true;
    }
  }

  return false;
}

export default function BingoBoard() {
  const [matches, setMatches] = useState<Matches>({});
  const [isReady, setIsReady] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [name, setName] = useState("");
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
  const completedCount = Object.values(matches).filter((value) =>
    value.trim(),
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
    closeEditor();
  }

  function clearBoard() {
    if (!completedCount) return;
    if (!window.confirm("Clear all names from this bingo card?")) return;
    setMatches({});
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.topbar}>
          <Link className={styles.wordmark} href="/" aria-label="Back to tools">
            <span className={styles.wordmarkIcon} aria-hidden="true">
              ✳
            </span>
            <span>MEET &amp; MINGLE</span>
          </Link>
          <Link className={styles.backLink} href="/">
            <span aria-hidden="true">←</span> All tools
          </Link>
        </header>

        <section className={styles.hero} aria-labelledby="bingo-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>A fresher icebreaker</p>
            <h1 id="bingo-title">
              People <span>Bingo!</span>
            </h1>
            <p className={styles.intro}>
              Find someone who fits a clue, ask their name, and fill a square.
              How many new people can you meet?
            </p>
          </div>
          <aside className={styles.scoreCard} aria-label="Your progress">
            <span className={styles.scoreLabel}>NAMES FOUND</span>
            <strong aria-live="polite">
              {completedCount}<span> / 30</span>
            </strong>
            <span className={styles.scoreNote}>one conversation at a time</span>
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
            aria-valuemax={prompts.length}
            aria-valuenow={completedCount}
          >
            <span
              className={styles.progressFill}
              style={{ width: `${(completedCount / prompts.length) * 100}%` }}
            />
          </div>

          {bingo && (
            <p className={styles.bingoNotice} role="status">
              <span aria-hidden="true">✦</span> BINGO! You found a line of five.
            </p>
          )}

          <div
            className={styles.grid}
            role="group"
            aria-label="30 human bingo prompts"
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
                  aria-pressed={Boolean(matchedName)}
                  aria-label={`${prompt}${matchedName ? ` — matched with ${matchedName}` : " — add a name"}`}
                  onClick={(event) => {
                    activeTileRef.current = event.currentTarget;
                    setActiveId(id);
                    setName(matchedName ?? "");
                  }}
                >
                  <span className={styles.tileNumber}>
                    {String(id).padStart(2, "0")}
                    {isFreeSpace && <span className={styles.freeTag}>WILD</span>}
                  </span>
                  <span className={styles.tilePrompt}>{prompt}</span>
                  <span className={styles.tileFooter}>
                    {matchedName ? (
                      <>
                        <span className={styles.checkMark} aria-hidden="true">
                          ✓
                        </span>
                        <span className={styles.matchedName}>{matchedName}</span>
                      </>
                    ) : (
                      <span className={styles.tapHint}>Tap to add a name</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <footer className={styles.boardFooter}>
            <span>25 prompts from your list + 5 extra icebreakers</span>
            <span>Names save on this device only</span>
          </footer>
        </section>

        <footer className={styles.pageFooter}>
          <span>Say hello. Start a conversation.</span>
          <span>PEOPLE BINGO · 2026</span>
        </footer>
      </div>

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
