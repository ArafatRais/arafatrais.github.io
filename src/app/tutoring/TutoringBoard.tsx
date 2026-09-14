"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  PointerEvent,
  WheelEvent,
} from "react";
import type * as Y from "yjs";
import type { WebrtcProvider as YWebrtcProvider } from "y-webrtc";

type Tool = "select" | "pen" | "highlighter" | "eraser";
type EraserMode = "standard" | "stroke";
type Role = "tutor" | "student";
type DocumentKind = "sample" | "blank" | "pdf";
type ConnectionStatus = "starting" | "pairing" | "connected" | "offline";
type PeerTransport = "webrtc" | "browser" | "none";
type StudentViewMode = "follow" | "free";

type Point = {
  x: number;
  y: number;
};

type Annotation = {
  id: string;
  documentId: string;
  page: number;
  points: Point[];
  color: string;
  width: number;
  opacity: number;
  author: Role;
  segments?: Point[][];
};

type PageImage = {
  id: string;
  documentId: string;
  page: number;
  src: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  author: Role;
};

type BoardSnapshot = {
  annotations: Annotation[];
  images: PageImage[];
};

type OpenDocument = {
  id: string;
  kind: DocumentKind;
  name: string;
  file?: File;
  document?: PdfDocument;
  pageCount: number;
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

type SyncContext = {
  doc: Y.Doc;
  provider: YWebrtcProvider;
  session: Y.Map<unknown>;
  annotations: Y.Map<unknown>;
  images: Y.Map<unknown>;
  pdfMeta: Y.Map<unknown>;
  pdfChunks: Y.Map<unknown>;
  liveStrokes: Y.Map<unknown>;
};

const SAMPLE_DOCUMENT: OpenDocument = {
  id: "sample",
  kind: "sample",
  name: "Sample tutoring worksheet",
  pageCount: 1,
};

const DEFAULT_PAPER = { width: 612, height: 792 };
const PDF_CHUNK_SIZE = 64_000;
const SESSION_STORAGE_KEY = "arafatrais-tutoring-session-code";
const PDF_STORAGE_KEY = "arafatrais-tutoring-pdf";

function createSessionCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function base64ToArrayBuffer(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function createAnnotationId() {
  return `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createImageId() {
  return `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDocumentId() {
  return `document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function getAnnotationSegments(annotation: Annotation) {
  return annotation.segments?.length ? annotation.segments : [annotation.points];
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

  if (name === "sidebar") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="14" rx="1.5" />
        <path d="M9 5v14M13 9h4M13 12h4M13 15h2" />
      </svg>
    );
  }

  if (name === "image") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="m5 17 4.3-4.2a1 1 0 0 1 1.4 0l2.3 2.2 1.5-1.5a1 1 0 0 1 1.4 0L19 15.6" />
      </svg>
    );
  }

  if (name === "lasso") {
    return (
      <svg {...common}>
        <path d="M18.5 9.5c2.2 2.5 1.4 5.8-1.8 7.4-3.2 1.6-8.4 1.3-11.4-1S2 10.2 4.1 7.3c2.1-2.8 6.5-3.8 9.8-2.1 2.2 1.1 3.1 3 2.5 4.6-.6 1.6-2.8 2.4-4.4 1.5-1.5-.8-1.6-2.7-.4-3.8" />
        <path d="M5 18.5 3.5 21M3.5 21l2.8-.2" />
      </svg>
    );
  }

  if (name === "plus") {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }

  if (name === "minus") {
    return (
      <svg {...common}>
        <path d="M5 12h14" />
      </svg>
    );
  }

  if (name === "more") {
    return (
      <svg {...common}>
        <circle cx="5" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="19" cy="12" r="1" fill="currentColor" />
      </svg>
    );
  }

  if (name === "bookmark") {
    return (
      <svg {...common}>
        <path d="M6 5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V20l-6-3-6 3V5.5Z" />
      </svg>
    );
  }

  if (name === "refresh") {
    return (
      <svg {...common}>
        <path d="M19 8a7 7 0 0 0-12.3-1.8L5 8" />
        <path d="M5 4.5V8h3.5M5 16a7 7 0 0 0 12.3 1.8L19 16" />
        <path d="M19 19.5V16h-3.5" />
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
  disabled = false,
  compact = false,
}: {
  active: boolean;
  label: string;
  name: string;
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      className={`board-tool ${compact ? "board-tool--compact" : ""} ${active ? "board-tool--active" : ""}`}
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
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
  const [images, setImages] = useState<PageImage[]>([]);
  const [history, setHistory] = useState<BoardSnapshot[]>([]);
  const [future, setFuture] = useState<BoardSnapshot[]>([]);
  const [sessionCode, setSessionCode] = useState("------");
  const [notice, setNotice] = useState("");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("starting");
  const [peerCount, setPeerCount] = useState(0);
  const [peerTransport, setPeerTransport] = useState<PeerTransport>("none");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [paperSize, setPaperSize] = useState(DEFAULT_PAPER);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [activeStroke, setActiveStroke] = useState<Point[] | null>(null);
  const [liveStrokes, setLiveStrokes] = useState<Annotation[]>([]);
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [studentViewMode, setStudentViewMode] =
    useState<StudentViewMode>("follow");
  const [studentCanEdit, setStudentCanEdit] = useState(true);
  const [inkColor, setInkColor] = useState("#111111");
  const [inkWidth, setInkWidth] = useState(0.006);
  const [highlighterWidth, setHighlighterWidth] = useState(0.026);
  const [eraserMode, setEraserMode] = useState<EraserMode>("standard");
  const [eraserSize, setEraserSize] = useState(0.035);
  const [zoom, setZoom] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openDocuments, setOpenDocuments] = useState<OpenDocument[]>([
    SAMPLE_DOCUMENT,
  ]);
  const [activeDocumentId, setActiveDocumentId] = useState("sample");
  const [documentKind, setDocumentKind] = useState<DocumentKind>("sample");
  const [documentName, setDocumentName] = useState("Sample tutoring worksheet");
  const [joinCode, setJoinCode] = useState("");
  const [joinPromptVisible, setJoinPromptVisible] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentStrokeRef = useRef<Point[]>([]);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const renderVersionRef = useRef(0);
  const pdfDocumentRef = useRef<PdfDocument | null>(null);
  const pdfFileRef = useRef<File | null>(null);
  const pageCountRef = useRef(1);
  const syncContextRef = useRef<SyncContext | null>(null);
  const pendingPdfRef = useRef<File | null>(null);
  const pendingPdfIdRef = useRef<string | null>(null);
  const pendingBlankDocumentRef = useRef<string | null>(null);
  const receivedPdfRef = useRef("");
  const restoredPdfRef = useRef(false);
  const openDocumentsRef = useRef<OpenDocument[]>([SAMPLE_DOCUMENT]);
  const activeDocumentIdRef = useRef("sample");
  const roleRef = useRef<Role>("tutor");
  const studentViewModeRef = useRef<StudentViewMode>("follow");
  const studentCanEditRef = useRef(true);
  const liveStrokeIdRef = useRef("");
  const eraserGestureHasHistoryRef = useRef(false);
  const selectionDragRef = useRef<{
    start: Point;
    current: Point;
    annotations: Annotation[];
    images: PageImage[];
    moved: boolean;
  } | null>(null);

  const canEdit = role === "tutor" || studentCanEdit;
  const visibleTool = canEdit ? activeTool : "select";

  useEffect(() => {
    roleRef.current = role;
    studentViewModeRef.current = studentViewMode;
    studentCanEditRef.current = studentCanEdit;
    activeDocumentIdRef.current = activeDocumentId;
  }, [activeDocumentId, role, studentCanEdit, studentViewMode]);

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

  const registerOpenDocument = useCallback(
    (file: File, document: PdfDocument, nextPageCount: number, idHint?: string) => {
      const existing = openDocumentsRef.current.find(
        (item) =>
          (idHint && item.id === idHint) ||
          (item.file?.name === file.name && item.file.size === file.size),
      );
      const nextDocument: OpenDocument = {
        id: existing?.id ?? idHint ?? createDocumentId(),
        kind: "pdf",
        name: file.name,
        file,
        document,
        pageCount: nextPageCount,
      };
      const next = existing
        ? openDocumentsRef.current.map((item) =>
            item.id === existing.id ? nextDocument : item,
          )
        : [...openDocumentsRef.current, nextDocument];
      openDocumentsRef.current = next;
      setOpenDocuments(next);
      return nextDocument.id;
    },
    [],
  );

  const persistTutorPdf = useCallback(async (file: File) => {
    try {
      const base64 = arrayBufferToBase64(await file.arrayBuffer());
      window.localStorage.setItem(
        PDF_STORAGE_KEY,
        JSON.stringify({ name: file.name, type: file.type, base64 }),
      );
    } catch {
      setNotice("PDF opened, but browser storage is full. It will not survive a reload.");
    }
  }, []);

  const publishPdf = useCallback(async (file: File, documentId: string) => {
    pendingPdfRef.current = file;
    pendingPdfIdRef.current = documentId;
    const context = syncContextRef.current;
    if (!context) return;

    const base64 = arrayBufferToBase64(await file.arrayBuffer());
    if (
      pendingPdfRef.current !== file ||
      syncContextRef.current !== context
    ) {
      return;
    }

    context.doc.transact(() => {
      context.pdfChunks.clear();
      context.pdfMeta.clear();
      context.pdfMeta.set("name", file.name);
      context.pdfMeta.set("documentId", documentId);
      context.pdfMeta.set("size", file.size);
      context.pdfMeta.set("version", Date.now());
      context.pdfMeta.set("total", Math.ceil(base64.length / PDF_CHUNK_SIZE));

      for (let index = 0; index < base64.length; index += PDF_CHUNK_SIZE) {
        context.pdfChunks.set(
          String(index / PDF_CHUNK_SIZE),
          base64.slice(index, index + PDF_CHUNK_SIZE),
        );
      }
    });
  }, []);

  const loadPdfFile = useCallback(
    async (file: File, shareWithPeer: boolean, documentIdHint?: string) => {
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
        const documentId = registerOpenDocument(
          file,
          document,
          document.numPages,
          documentIdHint,
        );

        const sharedPage = Number(syncContextRef.current?.session.get("page"));
        const initialPage =
          !shareWithPeer &&
          Number.isInteger(sharedPage) &&
          sharedPage >= 1 &&
          sharedPage <= document.numPages
            ? sharedPage
            : 1;

        pdfDocumentRef.current = document;
        pdfFileRef.current = file;
        setPdfFile(file);
        setDocumentKind("pdf");
        setDocumentName(file.name);
        setActiveDocumentId(documentId);
        pendingBlankDocumentRef.current = null;
        pageCountRef.current = document.numPages;
        setPageCount(document.numPages);
        setPageNumber(initialPage);
        setSelectedIds([]);
        setHistory([]);
        setFuture([]);
        void renderPdfPage(document, initialPage);
        setNotice(`${file.name} is ready on this board.`);

        if (shareWithPeer) {
          const context = syncContextRef.current;
          if (context) {
            context.session.set("documentId", documentId);
            context.session.set("documentKind", "pdf");
            context.session.set("page", 1);
          }
          void publishPdf(file, documentId);
          void persistTutorPdf(file);
        }
      } catch {
        setPdfError("This PDF could not be opened. Try another file.");
      } finally {
        setPdfLoading(false);
      }
    },
    [persistTutorPdf, publishPdf, registerOpenDocument, renderPdfPage],
  );

  const createBlankDocument = () => {
    if (role !== "tutor") return;
    const blankDocument: OpenDocument = {
      id: createDocumentId(),
      kind: "blank",
      name: "Untitled notes",
      pageCount: 1,
    };
    const next = [...openDocumentsRef.current, blankDocument];
    openDocumentsRef.current = next;
    setOpenDocuments(next);
    setActiveDocumentId(blankDocument.id);
    setDocumentKind("blank");
    setDocumentName(blankDocument.name);
    setPdfFile(null);
    pdfFileRef.current = null;
    pdfDocumentRef.current = null;
    pageCountRef.current = 1;
    setPageCount(1);
    setPageNumber(1);
    setPaperSize(DEFAULT_PAPER);
    setSelectedIds([]);
    setHistory([]);
    setFuture([]);
    pendingPdfRef.current = null;
    pendingPdfIdRef.current = null;
    pendingBlankDocumentRef.current = blankDocument.id;
    const context = syncContextRef.current;
    if (context) {
      context.doc.transact(() => {
        context.session.set("documentId", blankDocument.id);
        context.session.set("documentKind", "blank");
        context.session.set("page", 1);
        context.pdfMeta.clear();
        context.pdfChunks.clear();
      });
    }
    setNotice("Blank notes page ready.");
  };

  const activateDocument = (documentId: string) => {
    if (role !== "tutor") return;
    const document = openDocumentsRef.current.find((item) => item.id === documentId);
    if (!document) return;
    if (document.kind === "sample" || document.kind === "blank") {
      setActiveDocumentId(document.id);
      setDocumentKind(document.kind);
      setDocumentName(document.name);
      pendingBlankDocumentRef.current = document.kind === "blank" ? document.id : null;
      setPdfFile(null);
      pdfFileRef.current = null;
      pdfDocumentRef.current = null;
      pageCountRef.current = 1;
      setPageCount(1);
      setPageNumber(1);
      setPaperSize(DEFAULT_PAPER);
      setSelectedIds([]);
      setHistory([]);
      setFuture([]);
      const context = syncContextRef.current;
      context?.doc.transact(() => {
        context.session.set("documentId", document.id);
        context.session.set("documentKind", document.kind);
        context.session.set("page", 1);
        context.pdfMeta.clear();
        context.pdfChunks.clear();
      });
      setNotice(`${document.name} is ready.`);
      return;
    }
    if (document.file) {
      pendingBlankDocumentRef.current = null;
      void loadPdfFile(document.file, true, document.id);
    }
  };

  const pushHistory = useCallback(() => {
    setHistory((items) => [
      ...items,
      { annotations: [...annotations], images: [...images] },
    ]);
    setFuture([]);
  }, [annotations, images]);

  const replaceSharedContent = useCallback(
    (nextAnnotations: Annotation[], nextImages: PageImage[]) => {
    const context = syncContextRef.current;
    if (!context) return;

    context.doc.transact(() => {
      const annotationIds = new Set(
        nextAnnotations.map((annotation) => annotation.id),
      );
      Array.from(context.annotations.keys()).forEach((id) => {
        if (!annotationIds.has(id)) context.annotations.delete(id);
      });
      nextAnnotations.forEach((annotation) => {
        context.annotations.set(annotation.id, annotation);
      });
      const imageIds = new Set(nextImages.map((image) => image.id));
      Array.from(context.images.keys()).forEach((id) => {
        if (!imageIds.has(id)) context.images.delete(id);
      });
      nextImages.forEach((image) => {
        context.images.set(image.id, image);
      });
    });
    },
    [],
  );

  const updatePage = (nextPage: number, source: "local" | "remote" = "local") => {
    if (
      source === "local" &&
      roleRef.current === "student" &&
      studentViewModeRef.current === "follow"
    ) {
      setNotice("The tutor controls the page while Follow tutor is enabled.");
      return;
    }

    const boundedPage = Math.min(pageCountRef.current, Math.max(1, nextPage));
    setPageNumber(boundedPage);
    if (pdfDocumentRef.current) {
      void renderPdfPage(pdfDocumentRef.current, boundedPage);
    }
    if (source === "local" && roleRef.current === "tutor") {
      syncContextRef.current?.session.set("page", boundedPage);
    }
  };

  const handleStageWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) < 12) return;
    event.preventDefault();
    updatePage(pageNumber + (event.deltaY > 0 ? 1 : -1));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
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

    void loadPdfFile(file, true);
  };

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      if (!canEdit) return;

      const imageItem = Array.from(event.clipboardData?.items ?? []).find(
        (item) => item.kind === "file" && item.type.startsWith("image/"),
      );
      const file = imageItem?.getAsFile();
      if (!file) return;

      event.preventDefault();
      const base64 = arrayBufferToBase64(await file.arrayBuffer());
      const source = `data:${file.type || "image/png"};base64,${base64}`;
      const imageElement = new window.Image();

      imageElement.onload = () => {
        const imageRatio = imageElement.naturalWidth / imageElement.naturalHeight;
        const pageRatio = paperSize.width / paperSize.height;
        const width = 0.36;
        const height = Math.min(
          0.48,
          width * (1 / imageRatio) * pageRatio,
        );
        const image: PageImage = {
          id: createImageId(),
          documentId: activeDocumentId,
          page: pageNumber,
          src: source,
          name: file.name || "pasted-image",
          x: (1 - width) / 2,
          y: (1 - height) / 2,
          width,
          height,
          author: roleRef.current,
        };
        const nextImages = [...images, image];
        pushHistory();
        setImages(nextImages);
        syncContextRef.current?.images.set(image.id, image);
        setNotice("Photo pasted onto the page. Press ⌘V to add another.");
      };
      imageElement.onerror = () => {
        setNotice("That clipboard image could not be added.");
      };
      imageElement.src = source;
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [canEdit, images, pageNumber, paperSize.height, paperSize.width, pushHistory]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const invitedRoom = searchParams.get("room")?.trim().toUpperCase();
    const invitedRole = searchParams.get("role");
    const storedCode = window.localStorage.getItem(SESSION_STORAGE_KEY);
    const nextCode =
      invitedRoom ||
      (invitedRole === "student"
        ? "------"
        : storedCode || createSessionCode());
    const timer = window.setTimeout(() => {
      setSessionCode(nextCode);
      if (invitedRole === "student") setRole("student");
    }, 0);

    if (!invitedRoom && invitedRole !== "student" && !storedCode) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, nextCode);
    }

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (role !== "tutor" || sessionCode === "------" || restoredPdfRef.current) {
      return;
    }
    restoredPdfRef.current = true;
    const storedPdf = window.localStorage.getItem(PDF_STORAGE_KEY);
    if (!storedPdf) return;

    try {
      const parsed = JSON.parse(storedPdf) as {
        name?: string;
        type?: string;
        base64?: string;
      };
      if (!parsed.name || !parsed.base64) return;
      const file = new File([base64ToArrayBuffer(parsed.base64)], parsed.name, {
        type: parsed.type || "application/pdf",
      });
      window.setTimeout(() => void loadPdfFile(file, true), 0);
    } catch {
      window.localStorage.removeItem(PDF_STORAGE_KEY);
    }
  }, [loadPdfFile, role, sessionCode]);

  useEffect(() => {
    if (sessionCode === "------") return;

    let cancelled = false;
    let context: SyncContext | null = null;

    const startPeerRoom = async () => {
      try {
        const [{ Doc }, { WebrtcProvider: Provider }] = await Promise.all([
          import("yjs"),
          import("y-webrtc"),
        ]);
        if (cancelled) return;

        const doc = new Doc();
        const provider = new Provider(`arafatrais-tutoring-${sessionCode}`, doc, {
          password: sessionCode,
          maxConns: 4,
          // Same-browser previews can sync instantly over BroadcastChannel;
          // separate devices still use the provider's WebRTC signaling path.
          filterBcConns: true,
        });

        const syncContext: SyncContext = {
          doc,
          provider,
          session: doc.getMap("session"),
          annotations: doc.getMap("annotations"),
          images: doc.getMap("images"),
          liveStrokes: doc.getMap("live-strokes"),
          pdfMeta: doc.getMap("pdf-meta"),
          pdfChunks: doc.getMap("pdf-chunks"),
        };
        context = syncContext;
        syncContextRef.current = syncContext;
        setConnectionStatus("pairing");

        const readAnnotations = () => {
          const next = Array.from(syncContext.annotations.values())
            .filter(
              (value): value is Annotation =>
                Boolean(value && typeof value === "object" && "id" in value),
            )
            .sort((left, right) => left.id.localeCompare(right.id));
          setAnnotations(next);
        };

        const readImages = () => {
          const next = Array.from(syncContext.images.values())
            .filter(
              (value): value is PageImage =>
                Boolean(
                  value &&
                    typeof value === "object" &&
                    "id" in value &&
                    "src" in value &&
                    "page" in value,
                ),
            )
            .sort((left, right) => left.id.localeCompare(right.id));
          setImages(next);
        };

        const readLiveStrokes = () => {
          const next = Array.from(syncContext.liveStrokes.values())
            .filter(
              (value): value is Annotation =>
                Boolean(
                  value &&
                    typeof value === "object" &&
                    "id" in value &&
                    "page" in value &&
                    "points" in value,
                ),
            )
            .sort((left, right) => left.id.localeCompare(right.id));
          setLiveStrokes(next);
        };

        const readSession = () => {
          const sharedViewMode: StudentViewMode =
            syncContext.session.get("viewMode") === "free" ? "free" : "follow";
          const sharedCanEdit = syncContext.session.get("studentCanEdit") !== false;
          studentViewModeRef.current = sharedViewMode;
          studentCanEditRef.current = sharedCanEdit;
          setStudentViewMode(sharedViewMode);
          setStudentCanEdit(sharedCanEdit);

          const sharedDocumentKind = syncContext.session.get("documentKind");
          const sharedDocumentId = String(
            syncContext.session.get("documentId") ?? "sample",
          );
          if (roleRef.current === "student" && sharedDocumentKind === "blank") {
            setActiveDocumentId(sharedDocumentId);
            setDocumentKind("blank");
            setDocumentName("Untitled notes");
            setPdfFile(null);
            pdfFileRef.current = null;
            pdfDocumentRef.current = null;
            pageCountRef.current = 1;
            setPageCount(1);
            setPageNumber(1);
            setPaperSize(DEFAULT_PAPER);
          }

          if (
            roleRef.current === "student" &&
            sharedViewMode === "free"
          ) {
            return;
          }

          const sharedPage = Number(syncContext.session.get("page"));
          if (
            Number.isInteger(sharedPage) &&
            sharedPage >= 1 &&
            sharedPage <= pageCountRef.current
          ) {
            setPageNumber(sharedPage);
            if (pdfDocumentRef.current) {
              void renderPdfPage(pdfDocumentRef.current, sharedPage);
            }
          }
        };

        const readPdf = () => {
          const total = Number(syncContext.pdfMeta.get("total"));
          const name = String(syncContext.pdfMeta.get("name") ?? "shared.pdf");
          const documentId = String(
            syncContext.pdfMeta.get("documentId") ?? "shared-pdf",
          );
          const chunks = syncContext.pdfChunks;
          if (!Number.isInteger(total) || total < 1) {
            return;
          }
          if (chunks.size < total) return;

          const size = Number(syncContext.pdfMeta.get("size"));
          const version = String(syncContext.pdfMeta.get("version") ?? "");
          const signature = `${documentId}:${name}:${size}:${version}:${total}:${chunks.size}`;
          if (receivedPdfRef.current === signature) return;
          receivedPdfRef.current = signature;
          if (
            pdfFileRef.current?.name === name &&
            pdfFileRef.current.size === size &&
            activeDocumentIdRef.current === documentId
          ) {
            return;
          }

          const base64 = Array.from(chunks.entries())
            .sort(([left], [right]) => Number(left) - Number(right))
            .map(([, value]) => String(value))
            .join("");
          const file = new File([base64ToArrayBuffer(base64)], name, {
            type: "application/pdf",
          });
          void loadPdfFile(file, false, documentId);
        };

        const handleStatus = (payload: unknown) => {
          const connected =
            typeof payload === "object" &&
            payload !== null &&
            "connected" in payload &&
            Boolean(payload.connected);
          setConnectionStatus(connected ? "pairing" : "offline");
        };

        const handlePeers = (payload: unknown) => {
          if (!payload || typeof payload !== "object") return;
          const peers = payload as {
            webrtcPeers?: string[];
            bcPeers?: string[];
          };
          const totalPeers = new Set([
            ...(peers.webrtcPeers ?? []),
            ...(peers.bcPeers ?? []),
          ]).size;
          setPeerCount(totalPeers);
          setPeerTransport(
            (peers.webrtcPeers?.length ?? 0) > 0
              ? "webrtc"
              : (peers.bcPeers?.length ?? 0) > 0
                ? "browser"
                : "none",
          );
          setConnectionStatus(totalPeers > 0 ? "connected" : "pairing");
          if (totalPeers > 0) setNotice("Student connected. Changes are syncing live.");
        };

        if (roleRef.current === "tutor") {
          if (!syncContext.session.has("viewMode")) {
            syncContext.session.set("viewMode", "follow");
          }
          if (!syncContext.session.has("studentCanEdit")) {
            syncContext.session.set("studentCanEdit", true);
          }
        }

        syncContext.annotations.observe(readAnnotations);
        syncContext.images.observe(readImages);
        syncContext.liveStrokes.observe(readLiveStrokes);
        syncContext.session.observe(readSession);
        syncContext.pdfMeta.observe(readPdf);
        syncContext.pdfChunks.observe(readPdf);
        provider.on("status", handleStatus);
        provider.on("peers", handlePeers);
        readAnnotations();
        readImages();
        readLiveStrokes();
        readSession();
        readPdf();
        setNotice("Room ready. Waiting for your student to join.");

        if (roleRef.current === "tutor") {
          if (!syncContext.session.has("documentKind")) {
            syncContext.session.set("documentKind", "sample");
          }
          if (!syncContext.session.has("documentId")) {
            syncContext.session.set("documentId", "sample");
          }
        }
        if (pendingPdfRef.current && pendingPdfIdRef.current) {
          void publishPdf(pendingPdfRef.current, pendingPdfIdRef.current);
        } else if (pendingBlankDocumentRef.current && roleRef.current === "tutor") {
          syncContext.session.set("documentId", pendingBlankDocumentRef.current);
          syncContext.session.set("documentKind", "blank");
        }
      } catch {
        if (!cancelled) {
          setConnectionStatus("offline");
          setNotice("Peer pairing is unavailable right now. The local board still works.");
        }
      }
    };

    void startPeerRoom();

    return () => {
      cancelled = true;
      if (context) {
        context.provider.destroy();
        context.doc.destroy();
        if (syncContextRef.current === context) syncContextRef.current = null;
      }
    };
  }, [loadPdfFile, publishPdf, renderPdfPage, sessionCode]);

  const pointFromEvent = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  };

  const pointDistance = (left: Point, right: Point) =>
    Math.hypot(left.x - right.x, left.y - right.y);

  const selectedObjectAt = (point: Point) => {
    const image = [...images]
      .reverse()
      .find(
        (candidate) =>
          candidate.documentId === activeDocumentId &&
          candidate.page === pageNumber &&
          point.x >= candidate.x &&
          point.x <= candidate.x + candidate.width &&
          point.y >= candidate.y &&
          point.y <= candidate.y + candidate.height,
      );
    if (image) return image.id;

    const annotation = [...annotations]
      .reverse()
      .find(
        (candidate) =>
          candidate.documentId === activeDocumentId &&
          candidate.page === pageNumber &&
          getAnnotationSegments(candidate).some((segment) =>
            segment.some((candidatePoint) => pointDistance(candidatePoint, point) < 0.035),
          ),
      );
    return annotation?.id ?? null;
  };

  const translateAnnotation = (annotation: Annotation, delta: Point): Annotation => ({
    ...annotation,
    points: annotation.points.map((point) => ({
      x: clamp(point.x + delta.x),
      y: clamp(point.y + delta.y),
    })),
    segments: annotation.segments?.map((segment) =>
      segment.map((point) => ({
        x: clamp(point.x + delta.x),
        y: clamp(point.y + delta.y),
      })),
    ),
  });

  const updateLiveStroke = (points: Point[]) => {
    const liveId = liveStrokeIdRef.current;
    if (!liveId) return;
    const liveStroke: Annotation = {
      id: liveId,
      documentId: activeDocumentId,
      page: pageNumber,
      points,
      segments: [points],
      color: inkColor,
      width: activeTool === "highlighter" ? highlighterWidth : inkWidth,
      opacity: activeTool === "highlighter" ? 0.28 : 0.92,
      author: role,
    };
    syncContextRef.current?.liveStrokes.set(liveId, liveStroke);
  };

  const eraseAt = (point: Point) => {
    if (!canEdit) return;
    const hit = [...annotations].reverse().find(
      (annotation) =>
        annotation.documentId === activeDocumentId &&
        annotation.page === pageNumber &&
        getAnnotationSegments(annotation).some((segment) =>
          segment.some((candidate) => pointDistance(candidate, point) < eraserSize),
        ),
    );

    if (!hit) return;
    const nextAnnotations = annotations.flatMap((annotation) => {
      if (annotation.id !== hit.id) return [annotation];
      if (eraserMode === "stroke") return [];

      const remainingSegments = getAnnotationSegments(annotation).flatMap((segment) => {
        const segments: Point[][] = [];
        let remaining: Point[] = [];
        segment.forEach((candidate) => {
          if (pointDistance(candidate, point) < eraserSize) {
            if (remaining.length >= 2) segments.push(remaining);
            remaining = [];
          } else {
            remaining.push(candidate);
          }
        });
        if (remaining.length >= 2) segments.push(remaining);
        return segments;
      });

      if (remainingSegments.length === 0) return [];
      return [{
        ...annotation,
        points: remainingSegments[0],
        segments: remainingSegments,
      }];
    });
    if (!eraserGestureHasHistoryRef.current) {
      pushHistory();
      eraserGestureHasHistoryRef.current = true;
    }
    setAnnotations(nextAnnotations);
    replaceSharedContent(nextAnnotations, images);
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!canEdit) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);

    if (activeTool === "select") {
      const selectedId = selectedObjectAt(point);
      if (!selectedId) {
        setSelectedIds([]);
        selectionDragRef.current = null;
        return;
      }
      const nextSelection = event.shiftKey && selectedIds.includes(selectedId)
        ? selectedIds.filter((id) => id !== selectedId)
        : event.shiftKey
          ? [...selectedIds, selectedId]
          : [selectedId];
      setSelectedIds(nextSelection);
      selectionDragRef.current = {
        start: point,
        current: point,
        annotations: annotations.filter((annotation) => nextSelection.includes(annotation.id)),
        images: images.filter((image) => nextSelection.includes(image.id)),
        moved: false,
      };
      return;
    }

    if (activeTool === "eraser") {
      eraserGestureHasHistoryRef.current = false;
      eraseAt(point);
      return;
    }

    currentStrokeRef.current = [point];
    liveStrokeIdRef.current = createAnnotationId();
    setActiveStroke([point]);
    updateLiveStroke([point]);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const point = pointFromEvent(event);
    if (activeTool === "select") {
      const drag = selectionDragRef.current;
      if (!drag) return;
      const delta = {
        x: point.x - drag.start.x,
        y: point.y - drag.start.y,
      };
      drag.current = point;
      if (Math.abs(delta.x) > 0.001 || Math.abs(delta.y) > 0.001) {
        drag.moved = true;
      }
      const selectedAnnotationIds = new Set(drag.annotations.map((annotation) => annotation.id));
      const selectedImageIds = new Set(drag.images.map((image) => image.id));
      setAnnotations((current) =>
        current.map((annotation) =>
          selectedAnnotationIds.has(annotation.id)
            ? translateAnnotation(drag.annotations.find((item) => item.id === annotation.id) ?? annotation, delta)
            : annotation,
        ),
      );
      setImages((current) =>
        current.map((image) => {
          const initial = drag.images.find((item) => item.id === image.id);
          if (!selectedImageIds.has(image.id) || !initial) return image;
          return {
            ...image,
            x: clamp(initial.x + delta.x),
            y: clamp(initial.y + delta.y),
          };
        }),
      );
      return;
    }
    if (activeTool === "eraser") {
      eraseAt(point);
      return;
    }
    if (currentStrokeRef.current.length === 0) return;
    const nextPoints = [...currentStrokeRef.current, point];
    currentStrokeRef.current = nextPoints;
    setActiveStroke(nextPoints);
    updateLiveStroke(nextPoints);
  };

  const handlePointerUp = () => {
    if (activeTool === "select") {
      const drag = selectionDragRef.current;
      if (drag?.moved) {
        const delta = {
          x: drag.current.x - drag.start.x,
          y: drag.current.y - drag.start.y,
        };
        const selectedAnnotationIds = new Set(
          drag.annotations.map((annotation) => annotation.id),
        );
        const selectedImageIds = new Set(drag.images.map((image) => image.id));
        const nextAnnotations = annotations.map((annotation) =>
          selectedAnnotationIds.has(annotation.id)
            ? translateAnnotation(
                drag.annotations.find((item) => item.id === annotation.id) ?? annotation,
                delta,
              )
            : annotation,
        );
        const nextImages = images.map((image) => {
          const initial = drag.images.find((item) => item.id === image.id);
          if (!selectedImageIds.has(image.id) || !initial) return image;
          return {
            ...image,
            x: clamp(initial.x + delta.x),
            y: clamp(initial.y + delta.y),
          };
        });
        pushHistory();
        setAnnotations(nextAnnotations);
        setImages(nextImages);
        replaceSharedContent(nextAnnotations, nextImages);
      }
      selectionDragRef.current = null;
      return;
    }
    if (activeTool === "eraser") {
      eraserGestureHasHistoryRef.current = false;
      return;
    }
    finishStroke();
  };

  const finishStroke = () => {
    if (currentStrokeRef.current.length < 2) {
      currentStrokeRef.current = [];
      setActiveStroke(null);
      if (liveStrokeIdRef.current) {
        syncContextRef.current?.liveStrokes.delete(liveStrokeIdRef.current);
        liveStrokeIdRef.current = "";
      }
      return;
    }

    const annotation: Annotation = {
      id: createAnnotationId(),
      documentId: activeDocumentId,
      page: pageNumber,
      points: currentStrokeRef.current,
      segments: [currentStrokeRef.current],
      color: inkColor,
      width: activeTool === "highlighter" ? highlighterWidth : inkWidth,
      opacity: activeTool === "highlighter" ? 0.28 : 0.92,
      author: role,
    };

    const nextAnnotations = [...annotations, annotation];
    pushHistory();
    setAnnotations(nextAnnotations);
    syncContextRef.current?.annotations.set(annotation.id, annotation);
    if (liveStrokeIdRef.current) {
      syncContextRef.current?.liveStrokes.delete(liveStrokeIdRef.current);
      liveStrokeIdRef.current = "";
    }
    currentStrokeRef.current = [];
    setActiveStroke(null);
  };

  const undo = () => {
    if (!canEdit) return;
    const previous = history.at(-1);
    if (!previous) return;
    const current = { annotations, images };
    setFuture((items) => [...items, current]);
    setAnnotations(previous.annotations);
    setImages(previous.images);
    setHistory((items) => items.slice(0, -1));
    replaceSharedContent(previous.annotations, previous.images);
  };

  const redo = () => {
    if (!canEdit) return;
    const next = future.at(-1);
    if (!next) return;
    const current = { annotations, images };
    setHistory((items) => [...items, current]);
    setAnnotations(next.annotations);
    setImages(next.images);
    setFuture((items) => items.slice(0, -1));
    replaceSharedContent(next.annotations, next.images);
  };

  const clearPage = () => {
    if (!canEdit) return;
    const pageAnnotations = annotations.filter(
      (annotation) =>
        annotation.documentId === activeDocumentId &&
        annotation.page === pageNumber,
    );
    const pageImages = images.filter(
      (image) => image.documentId === activeDocumentId && image.page === pageNumber,
    );
    if (pageAnnotations.length === 0 && pageImages.length === 0) return;
    const nextAnnotations = annotations.filter(
      (annotation) =>
        annotation.documentId !== activeDocumentId || annotation.page !== pageNumber,
    );
    const nextImages = images.filter(
      (image) => image.documentId !== activeDocumentId || image.page !== pageNumber,
    );
    pushHistory();
    setAnnotations(nextAnnotations);
    setImages(nextImages);
    replaceSharedContent(nextAnnotations, nextImages);
    setNotice(`Ink and images cleared from page ${pageNumber}.`);
  };

  const deleteSelection = () => {
    if (!canEdit || selectedIds.length === 0) return;
    const nextAnnotations = annotations.filter(
      (annotation) => !selectedIds.includes(annotation.id),
    );
    const nextImages = images.filter((image) => !selectedIds.includes(image.id));
    pushHistory();
    setAnnotations(nextAnnotations);
    setImages(nextImages);
    setSelectedIds([]);
    replaceSharedContent(nextAnnotations, nextImages);
    setNotice("Selected content deleted.");
  };

  const updateStudentViewMode = (nextMode: StudentViewMode) => {
    if (role !== "tutor") return;
    studentViewModeRef.current = nextMode;
    setStudentViewMode(nextMode);
    syncContextRef.current?.session.set("viewMode", nextMode);
    setNotice(
      nextMode === "follow"
        ? "Student view is now following your page."
        : "Student can now navigate pages independently.",
    );
  };

  const updateStudentCanEdit = (nextCanEdit: boolean) => {
    if (role !== "tutor") return;
    studentCanEditRef.current = nextCanEdit;
    setStudentCanEdit(nextCanEdit);
    syncContextRef.current?.session.set("studentCanEdit", nextCanEdit);
    setNotice(
      nextCanEdit
        ? "Student can annotate the shared document."
        : "Student is now in read-only mode.",
    );
  };

  const copyInvite = async () => {
    const invite = `${window.location.origin}/tutoring?room=${sessionCode}&role=student`;
    try {
      await navigator.clipboard.writeText(invite);
      setNotice("Invite link copied to clipboard.");
    } catch {
      setNotice(`Share code ${sessionCode} with your student.`);
    }
  };

  const regenerateSessionCode = () => {
    if (role !== "tutor") return;
    const nextCode = createSessionCode();
    window.localStorage.setItem(SESSION_STORAGE_KEY, nextCode);
    pendingPdfRef.current = pdfFileRef.current;
    pendingPdfIdRef.current = pdfFileRef.current ? activeDocumentId : null;
    pendingBlankDocumentRef.current =
      documentKind === "blank" ? activeDocumentId : null;
    setSessionCode(nextCode);
    setConnectionStatus("starting");
    setNotice(`New session ${nextCode} created. Share the new invite link.`);
  };

  const joinSession = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextCode = joinCode.trim().toUpperCase();
    if (nextCode.length < 4) return;
    setRole("student");
    setJoinPromptVisible(false);
    setSessionCode(nextCode);
    window.history.replaceState(
      null,
      "",
      `/tutoring?room=${nextCode}&role=student`,
    );
    setNotice(`Joining session ${nextCode}…`);
  };

  const downloadNotes = () => {
    const payload = JSON.stringify(
      {
        session: sessionCode,
        pdf: pdfFile?.name ?? "untitled.pdf",
        annotations,
        images,
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
    (annotation) =>
      annotation.documentId === activeDocumentId && annotation.page === pageNumber,
  );
  const pageImages = images.filter(
    (image) => image.documentId === activeDocumentId && image.page === pageNumber,
  );
  const pageLiveStrokes = liveStrokes.filter(
    (stroke) =>
      stroke.documentId === activeDocumentId && stroke.page === pageNumber,
  );
  const inkOwner = role === "tutor" ? "Tutor" : "Student";
  const connectionDescription =
    connectionStatus === "connected"
      ? peerTransport === "browser"
        ? `${peerCount} peer${peerCount === 1 ? "" : "s"} connected in another browser tab.`
        : `${peerCount} peer${peerCount === 1 ? "" : "s"} connected directly over WebRTC.`
      : connectionStatus === "offline"
        ? "Peer pairing is unavailable; local drawing still works."
        : "Room is open. Waiting for a student to join.";
  const showDetails = role === "tutor" && detailsVisible;
  const documentTabs: OpenDocument[] =
    openDocuments.length > 0
      ? openDocuments
      : [{
          id: "sample",
          kind: "sample",
          name: "Sample tutoring worksheet",
          pageCount: 1,
        }];

  return (
    <main className="board-shell">
      <div className={`board-layout ${showDetails ? "" : "board-layout--focused"}`}>
        {showDetails ? (
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
              Share this code with your student. The PDF and ink stay between
              the two browsers.
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
            {role === "tutor" ? (
              <label className="upload-button">
                <Icon name="upload" />
                <span>{pdfLoading ? "Opening PDF…" : "Open a PDF"}</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                />
              </label>
            ) : (
              <div className="document-lock">
                <span>DOCUMENT CONTROLLED BY TUTOR</span>
                <small>Shared files appear here automatically.</small>
              </div>
            )}
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
                <small>{connectionStatus === "connected" ? "Connected live" : "Waiting to join"}</small>
              </span>
              <span
                className={`presence ${connectionStatus === "connected" ? "" : "presence--empty"}`}
                aria-label={connectionStatus === "connected" ? "Connected" : "Not connected"}
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
        ) : null}

        <section className="board-main" aria-label="Tutoring document workspace">
          <div className="document-tabbar">
            <div className="document-tabbar__tab" title={pdfFile?.name ?? "Sample tutoring worksheet"}>
              <span className="document-tabbar__dot" aria-hidden="true" />
              <span className="document-tabbar__name">
                {pdfFile?.name ?? "Sample tutoring worksheet"}
              </span>
              <span className="document-tabbar__role">
                {role === "tutor" ? "TUTOR" : "STUDENT"}
              </span>
            </div>
            <div className="document-tabbar__meta mono">
              {role === "student"
                ? studentViewMode === "follow"
                  ? "FOLLOWING TUTOR"
                  : "FREE NAVIGATION"
                : "LOCAL-FIRST BOARD"}
            </div>
          </div>
          <div className="workspace-toolbar">
            <div className="toolbar-group toolbar-group--document">
              <button
                className="icon-button"
                type="button"
                aria-label="Previous page"
                disabled={pageNumber === 1 || (role === "student" && studentViewMode === "follow")}
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
                disabled={pageNumber === pageCount || (role === "student" && studentViewMode === "follow")}
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
                disabled={!canEdit || history.length === 0}
                onClick={undo}
              >
                <Icon name="undo" />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Redo"
                disabled={!canEdit || future.length === 0}
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

                {pageImages.map((image) => {
                  // These images are local clipboard data URLs; next/image cannot optimize them.
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={image.id}
                      className="page-image"
                      src={image.src}
                      alt={image.name}
                      draggable={false}
                      style={{
                        left: `${image.x * 100}%`,
                        top: `${image.y * 100}%`,
                        width: `${image.width * 100}%`,
                        height: `${image.height * 100}%`,
                      }}
                    />
                  );
                })}

                <svg
                  className={`annotation-layer ${visibleTool === "select" ? "annotation-layer--select" : ""} ${!canEdit ? "annotation-layer--readonly" : ""}`}
                  style={{ pointerEvents: canEdit && visibleTool !== "select" ? "auto" : "none" }}
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
                      stroke={inkColor}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={activeTool === "highlighter" ? Math.max(0.02, inkWidth * 2.5) : inkWidth}
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
              <ToolButton active={visibleTool === "select"} label="Select" name="grid" onClick={() => setActiveTool("select")} />
              <ToolButton active={visibleTool === "pen"} label="Pen" name="pen" disabled={!canEdit} onClick={() => setActiveTool("pen")} />
              <ToolButton active={visibleTool === "highlighter"} label="Highlight" name="highlighter" disabled={!canEdit} onClick={() => setActiveTool("highlighter")} />
              <ToolButton active={visibleTool === "eraser"} label="Erase" name="eraser" disabled={!canEdit} onClick={() => setActiveTool("eraser")} />
            </div>
            <div className="annotation-toolbar__context" aria-label="Writing options">
              <div className="ink-options" aria-label="Stroke thickness">
                {[0.004, 0.006, 0.01].map((width) => (
                  <button
                    key={width}
                    className={`ink-width ${inkWidth === width ? "ink-width--active" : ""}`}
                    type="button"
                    aria-label={`Stroke width ${width === 0.004 ? "thin" : width === 0.006 ? "medium" : "bold"}`}
                    aria-pressed={inkWidth === width}
                    disabled={!canEdit}
                    onClick={() => setInkWidth(width)}
                  >
                    <span style={{ width: `${Math.max(5, width * 1000)}px`, height: `${Math.max(2, width * 600)}px` }} />
                  </button>
                ))}
              </div>
              <span className="toolbar-separator" aria-hidden="true" />
              <div className="ink-options" aria-label="Ink colour">
                {["#0e8a5c", "#386b8c", "#d34e4e", "#d69a2d", "#242826"].map((color) => (
                  <button
                    key={color}
                    className={`ink-color ${inkColor === color ? "ink-color--active" : ""}`}
                    type="button"
                    aria-label={`Use ${color} ink`}
                    aria-pressed={inkColor === color}
                    disabled={!canEdit}
                    onClick={() => setInkColor(color)}
                    style={{ "--ink-color": color } as CSSProperties}
                  />
                ))}
              </div>
              <span className="paste-hint">
                <Icon name="image" />
                <kbd>⌘V</kbd>
                <span>paste photo</span>
              </span>
            </div>
            <div className="annotation-toolbar__actions">
              <button className="text-button" type="button" disabled={!canEdit} onClick={clearPage}>
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
                (role === "student" && !studentCanEdit
                  ? "Read only mode is active. The tutor controls annotations."
                  : role === "student" && studentViewMode === "follow"
                    ? "Following the tutor’s page. Copy a photo and press ⌘V to add it when editing is enabled."
                    : "This local board is ready. Open a PDF or draw on the sample sheet to try it.")}
            </span>
          </div>
        </section>

        {showDetails ? (
        <aside className="board-inspector">
          <div className="inspector-heading">
            <div>
              <p className="eyebrow">Session control</p>
              <h2>Live state</h2>
            </div>
            <span
              className={`live-pulse ${connectionStatus === "offline" ? "live-pulse--offline" : ""}`}
              aria-label={connectionDescription}
            />
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
              {connectionDescription}
            </p>
            <div className="state-card__line" />
            <div className="state-card__metric">
              <span>ANNOTATIONS</span>
              <strong className="mono">{String(annotations.length).padStart(2, "0")}</strong>
            </div>
          </div>

          <div className="inspector-block permissions-block">
            <div className="inspector-label">
              <span>{role === "tutor" ? "STUDENT ACCESS" : "ACCESS"}</span>
              <span className="mono">{studentCanEdit ? "EDIT" : "VIEW"}</span>
            </div>
            {role === "tutor" ? (
              <>
                <div className="permission-row">
                  <span>
                    <strong>Page access</strong>
                    <small>Choose how the student navigates.</small>
                  </span>
                  <div className="permission-switch" role="group" aria-label="Student page access">
                    <button
                      className={studentViewMode === "follow" ? "permission-switch__active" : ""}
                      type="button"
                      aria-pressed={studentViewMode === "follow"}
                      onClick={() => updateStudentViewMode("follow")}
                    >
                      Follow tutor
                    </button>
                    <button
                      className={studentViewMode === "free" ? "permission-switch__active" : ""}
                      type="button"
                      aria-pressed={studentViewMode === "free"}
                      onClick={() => updateStudentViewMode("free")}
                    >
                      Free navigation
                    </button>
                  </div>
                </div>
                <div className="permission-row">
                  <span>
                    <strong>Student editing</strong>
                    <small>Allow ink and image annotations.</small>
                  </span>
                  <div className="permission-switch" role="group" aria-label="Student editing access">
                    <button
                      className={studentCanEdit ? "permission-switch__active" : ""}
                      type="button"
                      aria-pressed={studentCanEdit}
                      onClick={() => updateStudentCanEdit(true)}
                    >
                      Can annotate
                    </button>
                    <button
                      className={!studentCanEdit ? "permission-switch__active" : ""}
                      type="button"
                      aria-pressed={!studentCanEdit}
                      onClick={() => updateStudentCanEdit(false)}
                    >
                      Read only
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="access-summary">
                {studentViewMode === "follow"
                  ? "Your page follows the tutor."
                  : "You can browse pages independently."} {studentCanEdit
                  ? "You can annotate the document."
                  : "The tutor has enabled read-only mode."}
              </p>
            )}
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
                  <small>{connectionStatus === "connected" ? "Connected live" : "WebRTC pairing"}</small>
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
              Copy a photo, then press ⌘V to place it on the current page. The
              tutor can keep the student on the same page or let them browse
              independently, and can switch their editing access off at any
              time.
            </p>
          </div>
        </aside>
        ) : null}
      </div>
    </main>
  );
}
