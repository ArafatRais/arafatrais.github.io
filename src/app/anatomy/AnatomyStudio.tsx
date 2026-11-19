"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./anatomy.module.css";
import { AnatomyEngine, type Manifest, type Mark, type Part } from "./engine";
import { check, hint, type Verdict } from "./answer";

type Structure = { id: string; name: string; sys: string; region: string };
type Mode = "explore" | "practice" | "exam";
type ExamAnswer = { target: string; picked: string | null; correct: boolean };

const REGIONS = ["All", "Head & neck", "Trunk", "Upper limb", "Lower limb"];
const SYSTEM_LABEL: Record<string, string> = {
  Skeleton: "Bones",
  Muscles: "Muscles",
  Organs: "Organs",
  Vessels: "Vessels",
  Nervous: "Brain & nerves",
};
const EXAM_LENGTH = 10;

function shuffle<T>(xs: T[]) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function AnatomyStudio() {
  const viewRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<AnatomyEngine | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("explore");
  const [systems, setSystems] = useState<Set<string>>(() => new Set(["Skeleton"]));
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [region, setRegion] = useState("All");
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  // Explore
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isolate, setIsolate] = useState(false);

  // Practice
  const [target, setTarget] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [showName, setShowName] = useState(false);
  const [seeThrough, setSeeThrough] = useState(true);
  const [score, setScore] = useState({ right: 0, total: 0, streak: 0 });
  const missed = useRef<{ id: string; due: number }[]>([]);
  const recent = useRef<string[]>([]);
  const turn = useRef(0);

  // Exam
  const [exam, setExam] = useState<{ queue: string[]; answers: ExamAnswer[] } | null>(null);
  const [examPicked, setExamPicked] = useState<ExamAnswer | null>(null);

  const structures = useMemo(() => {
    const map = new Map<string, Structure>();
    for (const p of manifest?.parts ?? []) {
      if (!map.has(p.c)) map.set(p.c, { id: p.c, name: p.n, sys: p.s, region: p.r });
    }
    return map;
  }, [manifest]);

  const partVisible = useCallback(
    (p: Part) => systems.has(p.s) && (region === "All" || p.r === region) && !hidden.has(p.c),
    [systems, region, hidden],
  );

  const pool = useMemo(
    () =>
      [...structures.values()].filter(
        (s) => systems.has(s.sys) && (region === "All" || s.region === region) && !hidden.has(s.id),
      ),
    [structures, systems, region, hidden],
  );

  // Load the manifest, then start the 3D engine.
  useEffect(() => {
    let alive = true;
    fetch("/anatomy/parts.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load the model list (${r.status})`);
        return r.json() as Promise<Manifest>;
      })
      .then((m) => alive && setManifest(m))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!manifest || !viewRef.current) return;
    const engine = new AnatomyEngine(viewRef.current, manifest);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [manifest]);

  // Load any newly switched-on systems.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const sys of systems) {
      if (engine.isLoaded(sys)) continue;
      setLoading((l) => new Set(l).add(sys));
      const first = engine.isLoaded("Skeleton") === false && sys === "Skeleton";
      engine
        .loadSystem(sys)
        .then(() => first && engine.frame(null, false))
        .catch((e: Error) => setError(e.message))
        .finally(() =>
          setLoading((l) => {
            const n = new Set(l);
            n.delete(sys);
            return n;
          }),
        );
    }
  }, [systems, manifest]);

  useEffect(() => {
    engineRef.current?.setVisibility(partVisible);
  }, [partVisible, manifest]);

  // What to colour on the model.
  useEffect(() => {
    const marks = new Map<string, Mark>();
    let fade: number | null = null;
    if (mode === "explore" && selected) {
      marks.set(selected, "select");
      fade = isolate ? 0.1 : null;
    } else if (mode === "practice" && target) {
      marks.set(target, verdict === "correct" ? "right" : verdict ? "wrong" : "target");
      fade = seeThrough ? 0.3 : null;
    } else if (mode === "exam" && examPicked) {
      if (examPicked.correct) marks.set(examPicked.target, "right");
      else {
        marks.set(examPicked.target, "target");
        if (examPicked.picked) marks.set(examPicked.picked, "wrong");
      }
    }
    engineRef.current?.setMarks(marks, fade);
  }, [mode, selected, isolate, target, seeThrough, verdict, examPicked, manifest]);

  // ---------- Practice ----------
  const nextPractice = useCallback(() => {
    if (!pool.length) {
      setTarget(null);
      return;
    }
    turn.current += 1;
    const ids = new Set(pool.map((s) => s.id));
    missed.current = missed.current.filter((m) => ids.has(m.id));
    const dueIdx = missed.current.findIndex((m) => m.due <= turn.current);
    let id: string;
    if (dueIdx >= 0) {
      id = missed.current[dueIdx].id;
      missed.current.splice(dueIdx, 1);
    } else {
      const fresh = pool.filter((s) => !recent.current.includes(s.id));
      const from = fresh.length ? fresh : pool;
      id = from[Math.floor(Math.random() * from.length)].id;
    }
    recent.current = [id, ...recent.current].slice(0, Math.min(8, Math.floor(pool.length / 2)));
    setTarget(id);
    setAnswer("");
    setVerdict(null);
    setHintLevel(0);
    engineRef.current?.frame(id);
  }, [pool]);

  const submitPractice = () => {
    if (!target || verdict) return;
    const name = structures.get(target)!.name;
    const v = check(answer, name);
    setVerdict(v);
    const ok = v === "correct";
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1, streak: ok ? s.streak + 1 : 0 }));
    if (!ok || hintLevel > 0) missed.current.push({ id: target, due: turn.current + 4 });
  };

  const revealPractice = () => {
    if (!target || verdict) return;
    setVerdict("wrong");
    setScore((s) => ({ ...s, total: s.total + 1, streak: 0 }));
    missed.current.push({ id: target, due: turn.current + 4 });
  };

  // ---------- Exam ----------
  const startExam = () => {
    const queue = shuffle(pool.map((s) => s.id)).slice(0, EXAM_LENGTH);
    setExam({ queue, answers: [] });
    setExamPicked(null);
    engineRef.current?.frame(null, false);
  };

  const examCurrent = exam && exam.answers.length < exam.queue.length ? exam.queue[exam.answers.length] : null;

  const recordExam = (picked: string | null) => {
    if (!exam || !examCurrent || examPicked) return;
    const a = { target: examCurrent, picked, correct: picked === examCurrent };
    setExamPicked(a);
  };

  const nextExam = () => {
    if (!exam || !examPicked) return;
    setExam({ ...exam, answers: [...exam.answers, examPicked] });
    setExamPicked(null);
  };

  // ---------- Picking on the model ----------
  const pickRef = useRef<(id: string | null) => void>(() => {});
  useEffect(() => {
    pickRef.current = (id) => {
      if (mode === "explore") setSelected(id);
      else if (mode === "exam" && examCurrent && !examPicked && id) recordExam(id);
    };
  });

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.onPick = (id) => pickRef.current(id);
    engine.onHover = mode === "explore" ? (id, x, y) => setHover(id ? { id, x, y } : null) : null;
  }, [mode, manifest]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setHover(null);
    setVerdict(null);
    setExamPicked(null);
    if (m === "practice") nextPractice();
    if (m === "exam") setExam(null);
  };

  const toggleSystem = (sys: string) => {
    setSystems((prev) => {
      const n = new Set(prev);
      if (n.has(sys)) {
        if (n.size > 1) n.delete(sys);
      } else n.add(sys);
      return n;
    });
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    return pool
      .filter((s) => words.every((w) => s.name.toLowerCase().includes(w)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 80);
  }, [pool, query]);

  const choose = (id: string) => {
    setSelected(id);
    engineRef.current?.frame(id);
  };

  const sel = selected ? structures.get(selected) : null;
  // A target that drops out of scope (system switched off, region changed) is ignored.
  const tgt = target && pool.some((s) => s.id === target) ? structures.get(target) : null;
  const totalStructures = structures.size;
  const examDone = exam && !examCurrent;
  const examScore = exam ? exam.answers.filter((a) => a.correct).length : 0;

  return (
    <main className={styles.page}>
      <div className={styles.viewer}>
        <div ref={viewRef} className={styles.canvas} />
        {!manifest && !error && <div className={styles.overlay}>Loading model list…</div>}
        {loading.size > 0 && (
          <div className={styles.loading}>Loading {[...loading].map((s) => SYSTEM_LABEL[s]).join(", ")}…</div>
        )}
        {error && <div className={styles.overlay}>{error}</div>}
        {hover && (
          <div className={styles.tooltip} style={{ left: hover.x + 14, top: hover.y + 14 }}>
            {structures.get(hover.id)?.name}
          </div>
        )}
        <div className={styles.viewButtons}>
          {(["front", "back", "left", "right"] as const).map((v) => (
            <button key={v} onClick={() => engineRef.current?.view(v)} title={`View from the ${v}`}>
              {v}
            </button>
          ))}
          <button onClick={() => engineRef.current?.frame(null, false)}>reset</button>
        </div>
        {mode === "exam" && examCurrent && (
          <div className={styles.prompt}>
            <span>Find</span>
            <strong>{structures.get(examCurrent)?.name}</strong>
          </div>
        )}
      </div>

      <aside className={styles.panel}>
        <header className={styles.head}>
          <h1>Anatomy Spotter</h1>
          <p>
            {totalStructures ? `${totalStructures} structures` : "Free 3D anatomy practice"} · free, no account
          </p>
        </header>

        <nav className={styles.tabs} aria-label="Mode">
          {(["explore", "practice", "exam"] as const).map((m) => (
            <button key={m} className={mode === m ? styles.active : ""} onClick={() => switchMode(m)}>
              {m}
            </button>
          ))}
        </nav>

        <section className={styles.scope}>
          <div className={styles.chips}>
            {(manifest?.systems ?? []).map((s) => (
              <button
                key={s}
                className={systems.has(s) ? styles.on : ""}
                onClick={() => toggleSystem(s)}
                aria-pressed={systems.has(s)}
              >
                {SYSTEM_LABEL[s] ?? s}
              </button>
            ))}
          </div>
          <label className={styles.select}>
            Region
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <p className={styles.muted}>
            {pool.length} in scope
            {hidden.size > 0 && (
              <>
                {" · "}
                <button className={styles.link} onClick={() => setHidden(new Set())}>
                  show {hidden.size} hidden
                </button>
              </>
            )}
          </p>
        </section>

        {mode === "explore" && (
          <section className={styles.body}>
            {sel ? (
              <div className={styles.card}>
                <small>{SYSTEM_LABEL[sel.sys]} · {sel.region}</small>
                <h2>{sel.name}</h2>
                <div className={styles.row}>
                  <button onClick={() => engineRef.current?.frame(sel.id)}>Zoom to</button>
                  <button className={isolate ? styles.on : ""} onClick={() => setIsolate((v) => !v)}>
                    Isolate
                  </button>
                  <button
                    onClick={() => {
                      setHidden((h) => new Set(h).add(sel.id));
                      setSelected(null);
                    }}
                  >
                    Hide
                  </button>
                  <button onClick={() => setSelected(null)}>Clear</button>
                </div>
              </div>
            ) : (
              <p className={styles.muted}>
                Drag to turn, scroll or pinch to zoom, right-drag to pan. Click a structure to name it, or hide it to see what is underneath.
              </p>
            )}
            <input
              className={styles.input}
              placeholder="Search structures"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <ul className={styles.list}>
              {results.map((s) => (
                <li key={s.id}>
                  <button className={s.id === selected ? styles.on : ""} onClick={() => choose(s.id)}>
                    {s.name}
                  </button>
                </li>
              ))}
              {!results.length && <li className={styles.muted}>Nothing matches in the current scope.</li>}
            </ul>
          </section>
        )}

        {mode === "practice" && (
          <section className={styles.body}>
            <p className={styles.muted}>
              Name the highlighted structure. Typos are fine; the side (left or right) counts. Missed ones come back a few turns later.
            </p>
            {tgt ? (
              <form
                className={styles.card}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (verdict) nextPractice();
                  else submitPractice();
                }}
              >
                {(showName || hintLevel > 0) && !verdict && (
                  <p className={styles.hint}>{showName ? tgt.name : hint(tgt.name, hintLevel)}</p>
                )}
                <input
                  className={styles.input}
                  autoFocus
                  placeholder="What is this?"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  readOnly={!!verdict}
                  autoComplete="off"
                  spellCheck={false}
                />
                {verdict && (
                  <p className={verdict === "correct" ? styles.good : styles.bad}>
                    {verdict === "correct" && "Correct: "}
                    {verdict === "side" && "Right structure, wrong side: "}
                    {verdict === "wrong" && "It's the "}
                    <strong>{tgt.name}</strong>
                  </p>
                )}
                <div className={styles.row}>
                  {verdict ? (
                    <button type="submit" className={styles.primary}>Next</button>
                  ) : (
                    <>
                      <button type="submit" className={styles.primary} disabled={!answer.trim()}>Check</button>
                      <button type="button" onClick={() => setHintLevel((h) => h + 1)}>Hint</button>
                      <button type="button" onClick={revealPractice}>Reveal</button>
                    </>
                  )}
                  <button type="button" onClick={() => engineRef.current?.frame(tgt.id)}>Zoom</button>
                </div>
              </form>
            ) : (
              <div className={styles.row}>
                <button className={styles.primary} disabled={!pool.length} onClick={nextPractice}>
                  {pool.length ? "Next structure" : "Nothing in scope"}
                </button>
              </div>
            )}
            <label className={styles.check}>
              <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
              Learning round: show the name before I answer
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={seeThrough} onChange={(e) => setSeeThrough(e.target.checked)} />
              See-through: fade everything else so hidden structures show
            </label>
            <p className={styles.score}>
              {score.right}/{score.total} correct · streak {score.streak}
            </p>
          </section>
        )}

        {mode === "exam" && (
          <section className={styles.body}>
            {!exam && (
              <div className={styles.card}>
                <h2>Spotter exam</h2>
                <p className={styles.muted}>
                  {Math.min(EXAM_LENGTH, pool.length)} structures from the current scope. You get a name and click it on the model, with no hints.
                </p>
                <button className={styles.primary} disabled={!pool.length} onClick={startExam}>
                  Start
                </button>
              </div>
            )}
            {exam && examCurrent && (
              <div className={styles.card}>
                <small>
                  Question {exam.answers.length + 1} of {exam.queue.length}
                </small>
                <h2>{structures.get(examCurrent)?.name}</h2>
                {examPicked ? (
                  <>
                    <p className={examPicked.correct ? styles.good : styles.bad}>
                      {examPicked.correct
                        ? "Correct."
                        : examPicked.picked
                          ? `You picked the ${structures.get(examPicked.picked)?.name}. The answer is shown in amber.`
                          : "Skipped. The answer is shown in amber."}
                    </p>
                    <div className={styles.row}>
                      <button className={styles.primary} onClick={nextExam}>
                        {exam.answers.length + 1 === exam.queue.length ? "Finish" : "Next"}
                      </button>
                      <button onClick={() => engineRef.current?.frame(examPicked.target)}>Show answer</button>
                    </div>
                  </>
                ) : (
                  <div className={styles.row}>
                    <button onClick={() => recordExam(null)}>Skip</button>
                  </div>
                )}
              </div>
            )}
            {examDone && (
              <div className={styles.card}>
                <h2>
                  {examScore}/{exam.queue.length}
                </h2>
                <ul className={styles.review}>
                  {exam.answers.map((a, i) => (
                    <li key={i} className={a.correct ? styles.good : styles.bad}>
                      {a.correct ? "✓" : "✗"} {structures.get(a.target)?.name}
                    </li>
                  ))}
                </ul>
                <div className={styles.row}>
                  <button className={styles.primary} onClick={startExam}>New exam</button>
                  {examScore < exam.queue.length && (
                    <button
                      onClick={() => {
                        setExam({ queue: shuffle(exam.answers.filter((a) => !a.correct).map((a) => a.target)), answers: [] });
                        setExamPicked(null);
                      }}
                    >
                      Retry missed
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        <footer className={styles.foot}>
          3D models from{" "}
          <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noreferrer">
            BodyParts3D
          </a>
          , © The Database Center for Life Science, licensed{" "}
          <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en" target="_blank" rel="noreferrer">
            CC BY-SA 2.1 JP
          </a>
          . Meshes simplified for the web. Educational use only.
        </footer>
      </aside>
    </main>
  );
}
