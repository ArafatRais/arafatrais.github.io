"use client";

import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent } from "react";
import Link from "next/link";

type Tool = "select" | "pen" | "highlighter" | "eraser";
type Role = "tutor" | "student";

type Point = {
  x: number;
  y: number;
};

type Annotation = {
  id: string;
  page: number;
  points: Point[];
  color: string;
  width: number;
  opacity: number;
  author: Role;
};

type PdfPage = {
  getViewport: (options: { scale: number }) => {
    width: number;
    height: number;
  };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

const DEFAULT_PAPER = { width: 612, height: 792 };

function createAnnotationId() {
  return `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function Icon({ name }: { name: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  if (name === "arrow-left") {
    return (
      <svg {...common}>
        <path d="M19 12H5M11 18l-6-6 6-6" />
      </svg>
    );
  }

  if (name === "upload") {
    return (
      <svg {...common}>
        <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
      </svg>
    );
  }

  if (name === "share") {
    return (
      <svg {...common}>
        <circle cx="18" cy="5" r="2.5" />
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="19" r="2.5" />
        <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
      </svg>
    );
  }

  if (name === "chevron-left") {
    return (
      <svg {...common}>
        <path d="m14.5 17-5-5 5-5" />
      </svg>
    );
  }

  if (name === "chevron-right") {
    return (
      <svg {...common}>
        <path d="m9.5 17 5-5-5-5" />
      </svg>
    );
  }

  if (name === "undo") {
    return (
      <svg {...common}>
        <path d="M9 8 5 12l4 4" />
        <path d="M5 12h8a5 5 0 0 1 5 5v1" />
      </svg>
    );
  }

  if (name === "redo") {
    return (
      <svg {...common}>
        <path d="m15 8 4 4-4 4" />
        <path d="M19 12h-8a5 5 0 0 0-5 5v1" />
      </svg>
    );
  }

  if (name === "pen") {
    return (
      <svg {...common}>
        <path d="m5 19 1.3-4.1L15.8 5.4a2 2 0 0 1 2.8 2.8L9.1 17.7 5 19Z" />
        <path d="m13.5 7.7 2.8 2.8" />
      </svg>
    );
  }

  if (name === "highlighter") {
    return (
      <svg {...common}>
        <path d="m5 15 7.8-7.8a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L9 19H5v-4Z" />
        <path d="m13 8 3 3M4 21h16" />
      </svg>
    );
  }

  if (name === "eraser") {
    return (
      <svg {...common}>
        <path d="m7 16 7.8-9.1a2 2 0 0 1 2.9-.2l1.4 1.4a2 2 0 0 1-.2 2.9L11 18H7a2 2 0 0 1 0-2Z" />
        <path d="m11 18 2 2h6" />
      </svg>
    );
  }

  if (name === "grid") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 10h16M10 4v16M16 4v16M4 15h16" opacity=".5" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 11a2.5 2.5 0 1 0 0-5M16 14a4.5 4.5 0 0 1 4.5 5" />
      </svg>
    );
  }

  if (name === "download") {
    return (
      <svg {...common}>
        <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
      </svg>
    );
  }

  if (name === "x") {
    return (
      <svg {...common}>
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    );
  }

  return null;
}

function ToolButton({
  active,
  label,
  name,
  onClick,
}: {
  active: boolean;
  label: string;
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`board-tool ${active ? "board-tool--active" : ""}`}
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon name={name} />
      <span>{label}</span>
    </button>
  );
}

export default function TutoringBoard() {
  const [role, setRole] = useState<Role>("tutor");
  const [activeTool, setActiveTool] = useState<Tool>("pen");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [future, setFuture] = useState<Annotation[][]>([]);
  const [sessionCode] = useState("A7K2QP");
  const [notice, setNotice] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [paperSize, setPaperSize] = useState(DEFAULT_PAPER);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [activeStroke, setActiveStroke] = useState<Point[] | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentStrokeRef = useRef<Point[]>([]);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const renderVersionRef = useRef(0);

  const renderPdfPage = useCallback(
    async (document: PdfDocument, nextPage: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const renderVersion = renderVersionRef.current + 1;
      renderVersionRef.current = renderVersion;
      renderTaskRef.current?.cancel();

      const page = await document.getPage(nextPage);
      if (renderVersion !== renderVersionRef.current) return;

      const viewport = page.getViewport({ scale: 1.35 });
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setPaperSize({ width: viewport.width, height: viewport.height });

      const task = page.render({ canvasContext: context, viewport });
      renderTaskRef.current = task;

      try {
        await task.promise;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name !== "RenderingCancelledException"
        ) {
          setPdfError("That page could not be rendered.");
        }
      }
    },
    [],
  );

  const pushHistory = useCallback(() => {
    setHistory((items) => [...items, annotations]);
    setFuture([]);
  }, [annotations]);

  const updatePage = (nextPage: number) => {
    const boundedPage = Math.min(pageCount, Math.max(1, nextPage));
    setPageNumber(boundedPage);
    if (pdfDocument) {
      void renderPdfPage(pdfDocument, boundedPage);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setPdfError("Please choose a PDF file.");
      return;
    }

    setPdfLoading(true);
    setPdfError("");

    try {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url,
      ).toString();
      const data = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data });
      const document = await loadingTask.promise;

      setPdfFile(file);
      setPdfDocument(document);
      setPageCount(document.numPages);
      setPageNumber(1);
      void renderPdfPage(document, 1);
      setAnnotations([]);
      setHistory([]);
      setFuture([]);
      setNotice(`${file.name} is ready on this board.`);
    } catch {
      setPdfError("This PDF could not be opened. Try another file.");
    } finally {
      setPdfLoading(false);
    }
  };

  const pointFromEvent = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  };

  const eraseAt = (point: Point) => {
    const hit = annotations.find(
      (annotation) =>
        annotation.page === pageNumber &&
        annotation.points.some((candidate) => {
          const distance = Math.hypot(
            candidate.x - point.x,
            candidate.y - point.y,
          );
          return distance < 0.035;
        }),
    );

    if (!hit) return;
    pushHistory();
    setAnnotations((items) =>
      items.filter((annotation) => annotation.id !== hit.id),
    );
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (activeTool === "select") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);

    if (activeTool === "eraser") {
      eraseAt(point);
      return;
    }

    currentStrokeRef.current = [point];
    setActiveStroke([point]);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (
      activeTool === "select" ||
      activeTool === "eraser" ||
      currentStrokeRef.current.length === 0
    ) {
      return;
    }

    const point = pointFromEvent(event);
    const nextPoints = [...currentStrokeRef.current, point];
    currentStrokeRef.current = nextPoints;
    setActiveStroke(nextPoints);
  };

  const finishStroke = () => {
    if (currentStrokeRef.current.length < 2) {
      currentStrokeRef.current = [];
      setActiveStroke(null);
      return;
    }

    const annotation: Annotation = {
      id: createAnnotationId(),
      page: pageNumber,
      points: currentStrokeRef.current,
      color: role === "tutor" ? "#0e8a5c" : "#386b8c",
      width: activeTool === "highlighter" ? 0.02 : 0.006,
      opacity: activeTool === "highlighter" ? 0.28 : 0.92,
      author: role,
    };

    pushHistory();
    setAnnotations((items) => [...items, annotation]);
    currentStrokeRef.current = [];
    setActiveStroke(null);
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [...items, annotations]);
    setAnnotations(previous);
    setHistory((items) => items.slice(0, -1));
  };

  const redo = () => {
    const next = future.at(-1);
    if (!next) return;
    setHistory((items) => [...items, annotations]);
    setAnnotations(next);
    setFuture((items) => items.slice(0, -1));
  };

  const clearPage = () => {
    const pageAnnotations = annotations.filter(
      (annotation) => annotation.page === pageNumber,
    );
    if (pageAnnotations.length === 0) return;
    pushHistory();
    setAnnotations((items) =>
      items.filter((annotation) => annotation.page !== pageNumber),
    );
    setNotice(`Annotations cleared from page ${pageNumber}.`);
  };

  const copyInvite = async () => {
    const invite = `${window.location.origin}/tutoring?room=${sessionCode}`;
    try {
      await navigator.clipboard.writeText(invite);
      setNotice("Invite link copied to clipboard.");
    } catch {
      setNotice(`Share code ${sessionCode} with your student.`);
    }
  };

  const downloadNotes = () => {
    const payload = JSON.stringify(
      {
        session: sessionCode,
        pdf: pdfFile?.name ?? "untitled.pdf",
        annotations,
      },
      null,
      2,
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${pdfFile?.name.replace(/\.pdf$/i, "") ?? "tutoring-board"}-notes.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Annotation data downloaded. PDF flattening comes next.");
  };

  const pageAnnotations = annotations.filter(
    (annotation) => annotation.page === pageNumber,
  );
  const inkOwner = role === "tutor" ? "Tutor" : "Student";

  return (
    <main className="board-shell">
      <header className="board-header">
        <div className="board-header__left">
          <Link className="back-link" href="/" aria-label="Back to tools">
            <Icon name="arrow-left" />
            <span>Tools</span>
          </Link>
          <span className="header-divider" aria-hidden="true" />
          <div>
            <p className="eyebrow">Teaching instrument / 01</p>
            <h1>Live tutoring board</h1>
          </div>
        </div>
        <div className="board-header__right">
          <span className="mode-chip">
            <span className="status-dot" aria-hidden="true" />
            LOCAL BOARD
          </span>
          <div className="role-switch" aria-label="Annotation role">
            <button
              className={role === "tutor" ? "role-switch__active" : ""}
              type="button"
              onClick={() => setRole("tutor")}
            >
              Tutor
            </button>
            <button
              className={role === "student" ? "role-switch__active" : ""}
              type="button"
              onClick={() => setRole("student")}
            >
              Student
            </button>
          </div>
        </div>
      </header>

      <div className="board-layout">
        <aside className="board-sidebar">
          <div className="sidebar-block sidebar-block--session">
            <div className="sidebar-label">
              <span>SESSION</span>
              <span className="mono">01</span>
            </div>
            <div
              className="session-code"
              aria-label={`Session code ${sessionCode}`}
            >
              {sessionCode.split("").map((character, index) => (
                <span key={`${character}-${index}`}>{character}</span>
              ))}
            </div>
            <p className="session-helper">
              Share this code with your student when live pairing is enabled.
            </p>
            <button className="outline-button" type="button" onClick={copyInvite}>
              <Icon name="share" />
              Copy invite link
            </button>
          </div>

          <div className="sidebar-block">
            <div className="sidebar-label">
              <span>DOCUMENT</span>
              <span className="mono">{pdfFile ? "READY" : "EMPTY"}</span>
            </div>
            <label className="upload-button">
              <Icon name="upload" />
              <span>{pdfLoading ? "Opening PDF…" : "Open a PDF"}</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileChange}
              />
            </label>
            <div className="file-status">
              <span className="file-status__icon" aria-hidden="true">
                <Icon name="grid" />
              </span>
              <span>
                <strong>{pdfFile?.name ?? "No document loaded"}</strong>
                <small>
                  {pdfFile
                    ? `${pageCount} ${pageCount === 1 ? "page" : "pages"}`
                    : "Try the sample sheet"}
                </small>
              </span>
            </div>
            {pdfError ? <p className="error-text">{pdfError}</p> : null}
          </div>

          <div className="sidebar-block sidebar-block--people">
            <div className="sidebar-label">
              <span>PEOPLE</span>
              <span className="mono">{role === "tutor" ? "YOU" : "GUEST"}</span>
            </div>
            <div className="person-row">
              <span className="avatar avatar--tutor">AR</span>
              <span>
                <strong>Arafat</strong>
                <small>Tutor · you</small>
              </span>
              <span className="presence" aria-label="Present" />
            </div>
            <div className="person-row person-row--muted">
              <span className="avatar avatar--student">ST</span>
              <span>
                <strong>Student</strong>
                <small>Waiting to join</small>
              </span>
              <span
                className="presence presence--empty"
                aria-label="Not connected"
              />
            </div>
          </div>

          <div className="sidebar-footnote">
            <span className="eyebrow">Next connection</span>
            <p>
              Pair this board over WebRTC so annotations travel between
              browsers without storing the PDF.
            </p>
          </div>
        </aside>

        <section className="board-main" aria-label="Tutoring document workspace">
          <div className="workspace-toolbar">
            <div className="toolbar-group toolbar-group--document">
              <button
                className="icon-button"
                type="button"
                aria-label="Previous page"
                disabled={pageNumber === 1}
                onClick={() => updatePage(pageNumber - 1)}
              >
                <Icon name="chevron-left" />
              </button>
              <span className="page-count mono">
                <strong>{String(pageNumber).padStart(2, "0")}</strong>
                <span>/ {String(pageCount).padStart(2, "0")}</span>
              </span>
              <button
                className="icon-button"
                type="button"
                aria-label="Next page"
                disabled={pageNumber === pageCount}
                onClick={() => updatePage(pageNumber + 1)}
              >
                <Icon name="chevron-right" />
              </button>
              <span className="toolbar-separator" aria-hidden="true" />
              <span className="zoom-label mono">100%</span>
            </div>

            <div className="toolbar-group toolbar-group--history">
              <button
                className="icon-button"
                type="button"
                aria-label="Undo"
                disabled={history.length === 0}
                onClick={undo}
              >
                <Icon name="undo" />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Redo"
                disabled={future.length === 0}
                onClick={redo}
              >
                <Icon name="redo" />
              </button>
            </div>
          </div>

          <div className="canvas-stage">
            <div className="stage-meta stage-meta--top mono">
              <span>{pdfFile ? "DOCUMENT / LIVE" : "SAMPLE SHEET / LOCAL"}</span>
              <span>
                {pageAnnotations.length} {pageAnnotations.length === 1 ? "stroke" : "strokes"}
              </span>
            </div>
            <div className="paper-wrap">
              <div
                className={`paper ${pdfFile ? "paper--pdf" : "paper--sample"}`}
                style={{ aspectRatio: `${paperSize.width} / ${paperSize.height}` }}
              >
                <canvas
                  ref={canvasRef}
                  className={`pdf-canvas ${pdfFile ? "pdf-canvas--visible" : ""}`}
                />

                {!pdfFile ? (
                  <div className="sample-sheet" aria-label="Sample tutoring worksheet">
                    <div className="sample-sheet__header">
                      <span className="sample-sheet__label">PHYSICS / MECHANICS</span>
                      <span className="mono">01</span>
                    </div>
                    <div className="sample-sheet__rule" />
                    <p className="sample-sheet__kicker">Worked example</p>
                    <h2>A cyclist accelerates from rest.</h2>
                    <p className="sample-sheet__body">
                      If the acceleration is <em>2.4 m/s²</em> for <em>8 seconds</em>, what is the final velocity?
                    </p>
                    <div className="sample-sheet__equation">
                      <span>v = u + at</span>
                      <strong>v = 0 + (2.4 × 8)</strong>
                    </div>
                    <div className="sample-sheet__answer">
                      <span>FINAL VELOCITY</span>
                      <strong>19.2 m/s</strong>
                    </div>
                    <div className="sample-sheet__hint">
                      <span className="sample-sheet__hint-mark">+</span>
                      <span>Draw over this sheet, or open one of your own PDFs.</span>
                    </div>
                  </div>
                ) : null}

                <svg
                  className={`annotation-layer ${activeTool === "select" ? "annotation-layer--select" : ""}`}
                  viewBox="0 0 1 1"
                  preserveAspectRatio="none"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishStroke}
                  onPointerCancel={finishStroke}
                  aria-label="Annotation layer"
                >
                  {pageAnnotations.map((annotation) => (
                    <polyline
                      key={annotation.id}
                      points={annotation.points
                        .map((point) => `${point.x},${point.y}`)
                        .join(" ")}
                      fill="none"
                      stroke={annotation.color}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={annotation.width}
                      opacity={annotation.opacity}
                    />
                  ))}
                  {activeStroke ? (
                    <polyline
                      points={activeStroke
                        .map((point) => `${point.x},${point.y}`)
                        .join(" ")}
                      fill="none"
                      stroke={role === "tutor" ? "#0e8a5c" : "#386b8c"}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={activeTool === "highlighter" ? 0.02 : 0.006}
                      opacity={activeTool === "highlighter" ? 0.28 : 0.92}
                    />
                  ) : null}
                </svg>
              </div>
            </div>
            <div className="stage-meta stage-meta--bottom mono">
              <span>PAGE {String(pageNumber).padStart(2, "0")}</span>
              <span>{inkOwner.toUpperCase()} INK</span>
            </div>
          </div>

          <div className="annotation-toolbar">
            <div className="tool-selector" role="toolbar" aria-label="Annotation tools">
              <ToolButton active={activeTool === "select"} label="Select" name="grid" onClick={() => setActiveTool("select")} />
              <ToolButton active={activeTool === "pen"} label="Pen" name="pen" onClick={() => setActiveTool("pen")} />
              <ToolButton active={activeTool === "highlighter"} label="Highlight" name="highlighter" onClick={() => setActiveTool("highlighter")} />
              <ToolButton active={activeTool === "eraser"} label="Erase" name="eraser" onClick={() => setActiveTool("eraser")} />
            </div>
            <div className="annotation-toolbar__actions">
              <button className="text-button" type="button" onClick={clearPage}>
                <Icon name="x" />
                Clear page
              </button>
              <button className="text-button" type="button" onClick={downloadNotes}>
                <Icon name="download" />
                Export notes
              </button>
            </div>
          </div>

          <div className="workspace-note" role="status" aria-live="polite">
            <span className="workspace-note__mark" aria-hidden="true">i</span>
            <span>
              {notice ||
                "This local board is ready. Open a PDF or draw on the sample sheet to try it."}
            </span>
          </div>
        </section>

        <aside className="board-inspector">
          <div className="inspector-heading">
            <div>
              <p className="eyebrow">Session control</p>
              <h2>Live state</h2>
            </div>
            <span className="live-pulse" aria-label="Local session active" />
          </div>

          <div className="state-card">
            <div className="state-card__topline">
              <span className="eyebrow">CURRENT MODE</span>
              <span className="state-card__number mono">
                {role === "tutor" ? "T-01" : "S-01"}
              </span>
            </div>
            <strong>{role === "tutor" ? "Tutor workspace" : "Student workspace"}</strong>
            <p>
              {role === "tutor"
                ? "You control the document and invite the student."
                : "You can annotate the shared page when connected."}
            </p>
            <div className="state-card__line" />
            <div className="state-card__metric">
              <span>ANNOTATIONS</span>
              <strong className="mono">{String(annotations.length).padStart(2, "0")}</strong>
            </div>
          </div>

          <div className="inspector-block">
            <div className="inspector-label">
              <span>SYNC ROADMAP</span>
              <span className="mono">01 / 03</span>
            </div>
            <div className="roadmap">
              <div className="roadmap-item roadmap-item--done">
                <span className="roadmap-marker">✓</span>
                <span>
                  <strong>Local board</strong>
                  <small>PDF + vector ink</small>
                </span>
              </div>
              <div className="roadmap-item roadmap-item--current">
                <span className="roadmap-marker">02</span>
                <span>
                  <strong>Peer connection</strong>
                  <small>WebRTC pairing</small>
                </span>
              </div>
              <div className="roadmap-item">
                <span className="roadmap-marker">03</span>
                <span>
                  <strong>Lesson archive</strong>
                  <small>Optional save later</small>
                </span>
              </div>
            </div>
          </div>

          <div className="inspector-block inspector-block--tips">
            <div className="inspector-label">
              <span>QUICK NOTES</span>
              <Icon name="users" />
            </div>
            <p>
              Both tutor and student will eventually draw on the same vector
              layer. The PDF itself stays local to the session.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
