"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  PointerEvent,
  TouchEvent,
  WheelEvent,
} from "react";
import type * as Y from "yjs";
import type { WebrtcProvider as YWebrtcProvider } from "y-webrtc";

type Tool = "select" | "pen" | "highlighter" | "eraser" | "laser" | "text";
type EraserMode = "standard" | "stroke";
type LaserMode = "line" | "dot";
type Role = "tutor" | "student";
type DocumentKind = "sample" | "blank" | "pdf";
type ConnectionStatus = "starting" | "pairing" | "connected" | "offline";
type PeerTransport = "webrtc" | "browser" | "none";
type StudentViewMode = "follow" | "free";

type Point = {
  x: number;
  y: number;
};

type ViewportState = {
  zoom: number;
  panX: number;
  panY: number;
  scrollRatio: number;
};

type TouchPointList = {
  length: number;
  [index: number]: { clientX: number; clientY: number };
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
  kind?: "ink" | "laser";
  laserMode?: LaserMode;
  laserFadeUntil?: number;
};

type LaserStroke = {
  id: string;
  documentId: string;
  page: number;
  points: Point[];
  mode: LaserMode;
  author: Role;
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

type TextBox = {
  id: string;
  documentId: string;
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  fontSize: number;
  author: Role;
};

type BoardSnapshot = {
  annotations: Annotation[];
  images: PageImage[];
  textBoxes: TextBox[];
};

type OpenDocument = {
  id: string;
  kind: DocumentKind;
  name: string;
  file?: File;
  document?: PdfDocument;
  pageCount: number;
};

type SelectionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RasterPdfPage = {
  bytes: Uint8Array;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
};

type RenderedPdfPage = {
  page: number;
  src: string;
  width: number;
  height: number;
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
  textBoxes: Y.Map<unknown>;
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
const BOARD_STORAGE_KEY = "arafatrais-tutoring-board-state";
const SAMPLE_DISMISSED_KEY = "arafatrais-tutoring-sample-dismissed";

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

function dataUrlToBytes(value: string) {
  return new Uint8Array(base64ToArrayBuffer(value.split(",")[1] ?? ""));
}

function getExportFileName(customName: string, documentName: string) {
  const requestedName = customName.trim();
  const baseName = requestedName || `${documentName.replace(/\.pdf$/i, "")}-annotated`;
  const safeName = baseName.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return `${safeName.replace(/\.pdf$/i, "") || "annotated-document"}.pdf`;
}

function buildRasterPdf(pages: RasterPdfPage[]) {
  const encoder = new TextEncoder();
  const objects: Uint8Array[] = [];
  const pageIds: number[] = [];
  const object = (id: number, value: Uint8Array) => {
    objects[id] = value;
  };

  object(1, encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"));

  pages.forEach((page, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    pageIds.push(pageId);
    object(
      pageId,
      encoder.encode(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
    object(
      imageId,
      new Uint8Array([
        ...encoder.encode(
          `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
        ),
        ...page.bytes,
        ...encoder.encode("\nendstream"),
      ]),
    );
    object(
      contentId,
      (() => {
        const content = encoder.encode(
          `q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q`,
        );
        return new Uint8Array([
          ...encoder.encode(`<< /Length ${content.length} >>\nstream\n`),
          ...content,
          ...encoder.encode("\nendstream"),
        ]);
      })(),
    );
  });

  object(
    2,
    encoder.encode(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,
    ),
  );

  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n% tutoring board\n")];
  const offsets = new Array(objects.length).fill(0) as number[];
  let offset = chunks[0].length;
  for (let id = 1; id < objects.length; id += 1) {
    const body = objects[id] ?? encoder.encode("");
    const prefix = encoder.encode(`${id} 0 obj\n`);
    const suffix = encoder.encode("\nendobj\n");
    offsets[id] = offset;
    chunks.push(prefix, body, suffix);
    offset += prefix.length + body.length + suffix.length;
  }

  const xrefOffset = offset;
  const xref = [
    `xref\n0 ${objects.length}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((entry) => `${String(entry).padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>`,
    `startxref\n${xrefOffset}`,
    "%%EOF",
  ].join("\n");
  chunks.push(encoder.encode(xref));

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let cursor = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, cursor);
    cursor += chunk.length;
  });
  return output;
}

function createAnnotationId() {
  return `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createImageId() {
  return `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTextBoxId() {
  return `text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y || Number.EPSILON) +
          currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function rectIntersectsPolygon(rect: SelectionBounds, polygon: Point[]) {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return corners.some((corner) => pointInPolygon(corner, polygon)) ||
    polygon.some(
      (point) =>
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height,
    );
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

  if (name === "table") {
    return (
      <svg {...common}>
        <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
        <path d="M3.5 9.5h17M9 4v16m6-16v16" />
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

  if (name === "laser") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      </svg>
    );
  }

  if (name === "text") {
    return (
      <svg {...common}>
        <path d="M5 6h14M12 6v13M8.5 19h7" />
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
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
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
  const [pdfPagePreviews, setPdfPagePreviews] = useState<RenderedPdfPage[]>([]);
  const [boardHydrated, setBoardHydrated] = useState(false);
  const [activeStroke, setActiveStroke] = useState<Point[] | null>(null);
  const [activeStrokePage, setActiveStrokePage] = useState(1);
  const [activeLaser, setActiveLaser] = useState<LaserStroke | null>(null);
  const [eraserCursor, setEraserCursor] = useState<{ page: number; point: Point } | null>(null);
  const [activeStrokeId, setActiveStrokeId] = useState("");
  const [liveStrokes, setLiveStrokes] = useState<Annotation[]>([]);
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [periodicTableOpen, setPeriodicTableOpen] = useState(false);
  const [studentViewMode, setStudentViewMode] =
    useState<StudentViewMode>("follow");
  const [studentCanEdit, setStudentCanEdit] = useState(true);
  const [inkColor, setInkColor] = useState("#111111");
  const [inkWidth, setInkWidth] = useState(0.0045);
  const [highlighterWidth, setHighlighterWidth] = useState(0.018);
  const [eraserMode, setEraserMode] = useState<EraserMode>("standard");
  const [eraserSize, setEraserSize] = useState(0.024);
  const [laserMode, setLaserMode] = useState<LaserMode>("line");
  const [textFontSize, setTextFontSize] = useState(0.026);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [openDocuments, setOpenDocuments] = useState<OpenDocument[]>([
    SAMPLE_DOCUMENT,
  ]);
  const [activeDocumentId, setActiveDocumentId] = useState("sample");
  const [documentKind, setDocumentKind] = useState<DocumentKind>("sample");
  const [documentName, setDocumentName] = useState("Sample tutoring worksheet");
  const [joinCode, setJoinCode] = useState("");
  const [joinPromptVisible, setJoinPromptVisible] = useState(false);
  const [closeDocumentId, setCloseDocumentId] = useState<string | null>(null);
  const [exportDocumentId, setExportDocumentId] = useState<string | null>(null);
  const [exportName, setExportName] = useState("");
  const [exportCloseAfterSave, setExportCloseAfterSave] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pageElementsRef = useRef(new Map<number, HTMLElement>());
  const annotationsRef = useRef<Annotation[]>([]);
  const imagesRef = useRef<PageImage[]>([]);
  const textBoxesRef = useRef<TextBox[]>([]);
  const activePointerPageRef = useRef(1);
  const panTouchRef = useRef<{ x: number; y: number; distance: number } | null>(null);
  const touchGestureRef = useRef(false);
  const activeLaserRef = useRef<LaserStroke | null>(null);
  const laserTimeoutRef = useRef<number | null>(null);
  const followScrollFrameRef = useRef<number | null>(null);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const viewportSyncFrameRef = useRef<number | null>(null);
  const remoteViewportRef = useRef<ViewportState | null>(null);
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
    mode: "move" | "lasso";
    page: number;
    start: Point;
    current: Point;
    annotations: Annotation[];
    images: PageImage[];
    textBoxes: TextBox[];
    moved: boolean;
    lassoPoints: Point[];
  } | null>(null);
  const resizeRef = useRef<{
    start: Point;
    current: Point;
    bounds: SelectionBounds;
    annotations: Annotation[];
    images: PageImage[];
    textBoxes: TextBox[];
  } | null>(null);

  const canEdit = role === "tutor" || studentCanEdit;
  const visibleTool = canEdit ? activeTool : "select";

  useEffect(() => {
    roleRef.current = role;
    studentViewModeRef.current = studentViewMode;
    studentCanEditRef.current = studentCanEdit;
    activeDocumentIdRef.current = activeDocumentId;
  }, [activeDocumentId, role, studentCanEdit, studentViewMode]);

  useEffect(() => {
    annotationsRef.current = annotations;
    imagesRef.current = images;
    textBoxesRef.current = textBoxes;
  }, [annotations, images, textBoxes]);

  useEffect(() => {
    zoomRef.current = zoom;
    panRef.current = pan;
  }, [pan, zoom]);

  useEffect(() => {
    if (role !== "tutor" || sessionCode === "------") {
      const timer = window.setTimeout(() => setBoardHydrated(false), 0);
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;
    const hydrate = () => {
      if (cancelled) return;
      const storedBoard = window.localStorage.getItem(BOARD_STORAGE_KEY);
      if (storedBoard) {
        try {
          const parsed = JSON.parse(storedBoard) as Partial<BoardSnapshot>;
          if (Array.isArray(parsed.annotations)) {
            setAnnotations(parsed.annotations as Annotation[]);
          }
          if (Array.isArray(parsed.images)) {
            setImages(parsed.images as PageImage[]);
          }
          if (Array.isArray(parsed.textBoxes)) {
            setTextBoxes(parsed.textBoxes as TextBox[]);
          }
        } catch {
          window.localStorage.removeItem(BOARD_STORAGE_KEY);
        }
      }
      setBoardHydrated(true);
    };
    const timer = window.setTimeout(hydrate, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [role, sessionCode]);

  useEffect(() => {
    if (
      role !== "tutor" ||
      window.localStorage.getItem(SAMPLE_DISMISSED_KEY) !== "true"
    ) {
      return;
    }

    const nextDocuments = openDocumentsRef.current.filter(
      (document) => document.id !== SAMPLE_DOCUMENT.id,
    );
    if (nextDocuments.length === 0) {
      nextDocuments.push({
        id: createDocumentId(),
        kind: "blank",
        name: "Untitled notes",
        pageCount: 1,
      });
    }
    openDocumentsRef.current = nextDocuments;
    setOpenDocuments(nextDocuments);

    if (activeDocumentIdRef.current === SAMPLE_DOCUMENT.id) {
      const fallback = nextDocuments[0];
      activeDocumentIdRef.current = fallback.id;
      setActiveDocumentId(fallback.id);
      setDocumentKind(fallback.kind);
      setDocumentName(fallback.name);
      setPageNumber(1);
      setPageCount(fallback.pageCount);
      pageCountRef.current = fallback.pageCount;
      setPaperSize(DEFAULT_PAPER);
      pendingBlankDocumentRef.current =
        fallback.kind === "blank" ? fallback.id : null;
    }
  }, [role]);

  useEffect(() => {
    if (!boardHydrated || role !== "tutor" || sessionCode === "------") return;
    try {
      window.localStorage.setItem(
        BOARD_STORAGE_KEY,
        JSON.stringify({ annotations, images, textBoxes }),
      );
    } catch {
      // Local storage is best-effort; the live Yjs board remains available.
    }
  }, [annotations, boardHydrated, images, role, sessionCode, textBoxes]);

  /*
   * The hydration callback above is intentionally deferred one tick. This
   * keeps the initial render pure while still restoring the last tutor board
   * before the PDF restoration task paints its document.
   */

  const renderPdfPage = useCallback(
    async (document: PdfDocument, nextPage: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const renderVersion = renderVersionRef.current + 1;
      renderVersionRef.current = renderVersion;
      renderTaskRef.current?.cancel();

      const page = await document.getPage(nextPage);
      if (renderVersion !== renderVersionRef.current) return;

      const viewport = page.getViewport({ scale: 2 });
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

  const renderPdfPages = useCallback(async (pdfDocument: PdfDocument) => {
    const previews: RenderedPdfPage[] = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = window.document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) continue;
      const task = page.render({ canvasContext: context, viewport });
      await task.promise;
      previews.push({
        page: pageNumber,
        src: canvas.toDataURL("image/jpeg", 0.96),
        width: viewport.width,
        height: viewport.height,
      });
    }
    setPdfPagePreviews(previews);
  }, []);

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

  const persistTutorPdf = useCallback(async (file: File, documentId: string) => {
    try {
      const base64 = arrayBufferToBase64(await file.arrayBuffer());
      window.localStorage.setItem(
        PDF_STORAGE_KEY,
        JSON.stringify({ name: file.name, type: file.type, documentId, base64 }),
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
        setPdfPagePreviews([]);
        pendingBlankDocumentRef.current = null;
        pageCountRef.current = document.numPages;
        setPageCount(document.numPages);
        setPageNumber(initialPage);
        setSelectedIds([]);
        setHistory([]);
        setFuture([]);
        void renderPdfPage(document, initialPage);
        void renderPdfPages(document);
        setNotice(`${file.name} is ready on this board.`);

        if (shareWithPeer) {
          const context = syncContextRef.current;
          if (context) {
            context.session.set("documentId", documentId);
            context.session.set("documentKind", "pdf");
            context.session.set("page", 1);
          }
          void publishPdf(file, documentId);
          void persistTutorPdf(file, documentId);
        }
      } catch {
        setPdfError("This PDF could not be opened. Try another file.");
      } finally {
        setPdfLoading(false);
      }
    },
    [persistTutorPdf, publishPdf, registerOpenDocument, renderPdfPage, renderPdfPages],
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
    setPdfPagePreviews([]);
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
      setPdfPagePreviews([]);
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
      { annotations: [...annotations], images: [...images], textBoxes: [...textBoxes] },
    ]);
    setFuture([]);
  }, [annotations, images, textBoxes]);

  const replaceSharedContent = useCallback(
    (
      nextAnnotations: Annotation[],
      nextImages: PageImage[],
      nextTextBoxes = textBoxesRef.current,
    ) => {
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
      const textBoxIds = new Set(nextTextBoxes.map((textBox) => textBox.id));
      Array.from(context.textBoxes.keys()).forEach((id) => {
        if (!textBoxIds.has(id)) context.textBoxes.delete(id);
      });
      nextTextBoxes.forEach((textBox) => {
        context.textBoxes.set(textBox.id, textBox);
      });
    });
    },
    [],
  );

  useEffect(() => {
    const context = syncContextRef.current;
    if (
      !boardHydrated ||
      role !== "tutor" ||
      !context ||
      (annotations.length === 0 && images.length === 0 && textBoxes.length === 0) ||
      context.annotations.size > 0 ||
      context.images.size > 0 ||
      context.textBoxes.size > 0
    ) {
      return;
    }
    replaceSharedContent(annotations, images, textBoxes);
  }, [annotations, boardHydrated, images, replaceSharedContent, role, textBoxes]);

  const syncTutorViewport = useCallback(() => {
    const context = syncContextRef.current;
    const stage = stageRef.current;
    if (roleRef.current !== "tutor" || !context || !stage) return;
    const activeDocument = openDocumentsRef.current.find(
      (document) => document.id === activeDocumentIdRef.current,
    );
    const maxScrollTop = Math.max(0, stage.scrollHeight - stage.clientHeight);
    const scrollRatio = maxScrollTop > 0 ? stage.scrollTop / maxScrollTop : 0;
    const viewport: ViewportState = {
      zoom: zoomRef.current,
      panX: panRef.current.x,
      panY: panRef.current.y,
      scrollRatio: Math.min(1, Math.max(0, scrollRatio)),
    };
    context.doc.transact(() => {
      context.session.set("documentId", activeDocumentIdRef.current);
      context.session.set("documentKind", activeDocument?.kind ?? "sample");
      context.session.set("viewportZoom", viewport.zoom);
      context.session.set("viewportPanX", viewport.panX);
      context.session.set("viewportPanY", viewport.panY);
      context.session.set("viewportScrollRatio", viewport.scrollRatio);
    });
  }, []);

  const scheduleTutorViewportSync = useCallback(() => {
    if (roleRef.current !== "tutor" || viewportSyncFrameRef.current !== null) {
      return;
    }
    viewportSyncFrameRef.current = window.requestAnimationFrame(() => {
      viewportSyncFrameRef.current = null;
      syncTutorViewport();
    });
  }, [syncTutorViewport]);

  const restoreFollowScroll = useCallback(() => {
    if (
      roleRef.current !== "student" ||
      studentViewModeRef.current !== "follow" ||
      !remoteViewportRef.current ||
      !stageRef.current
    ) {
      return;
    }
    const maxScrollTop = Math.max(
      0,
      stageRef.current.scrollHeight - stageRef.current.clientHeight,
    );
    const stage = stageRef.current;
    const previousScrollBehavior = stage.style.scrollBehavior;
    stage.style.scrollBehavior = "auto";
    stage.scrollTop = remoteViewportRef.current.scrollRatio * maxScrollTop;
    stage.scrollLeft = 0;
    stage.style.scrollBehavior = previousScrollBehavior;
  }, []);

  useEffect(() => {
    if (role !== "tutor") return;
    scheduleTutorViewportSync();
  }, [pan.x, pan.y, role, scheduleTutorViewportSync, zoom]);

  useEffect(() => {
    if (role !== "student" || studentViewMode !== "follow") return;
    const frame = window.requestAnimationFrame(restoreFollowScroll);
    return () => window.cancelAnimationFrame(frame);
  }, [activeDocumentId, pageCount, pdfPagePreviews.length, role, restoreFollowScroll, studentViewMode, zoom]);

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
    setPan({ x: 0, y: 0 });
    window.requestAnimationFrame(() => {
      pageElementsRef.current.get(boundedPage)?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
      if (roleRef.current === "tutor") scheduleTutorViewportSync();
    });
    if (pdfDocumentRef.current) {
      void renderPdfPage(pdfDocumentRef.current, boundedPage);
    }
    if (source === "local" && roleRef.current === "tutor") {
      const activeDocument = openDocumentsRef.current.find(
        (document) => document.id === activeDocumentIdRef.current,
      );
      const context = syncContextRef.current;
      context?.doc.transact(() => {
        context.session.set("documentId", activeDocumentIdRef.current);
        context.session.set("documentKind", activeDocument?.kind ?? "sample");
        context.session.set("page", boundedPage);
      });
      scheduleTutorViewportSync();
    }
  };

  const handleStageWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (
      roleRef.current === "student" &&
      studentViewModeRef.current === "follow"
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (zoom > 1.001 || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const direction = event.deltaY > 0 ? -0.05 : 0.05;
        setZoom((current) => Math.min(1.6, Math.max(0.7, Number((current + direction).toFixed(2)))));
      } else {
        setPan((current) => ({
          x: Math.max(-520, Math.min(520, current.x - event.deltaX)),
          y: Math.max(-520, Math.min(520, current.y - event.deltaY)),
        }));
      }
      return;
    }
  };

  const handleStageScroll = () => {
    if (
      roleRef.current === "student" &&
      studentViewModeRef.current === "follow" &&
      followScrollFrameRef.current === null
    ) {
      followScrollFrameRef.current = window.requestAnimationFrame(() => {
        followScrollFrameRef.current = null;
        restoreFollowScroll();
      });
      return;
    }
    if (roleRef.current === "tutor") scheduleTutorViewportSync();
  };

  const handleStageKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      roleRef.current !== "student" ||
      studentViewModeRef.current !== "follow"
    ) {
      return;
    }
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const touchCenter = (touches: TouchPointList) => ({
    x: Array.from(touches).reduce((sum, touch) => sum + touch.clientX, 0) / touches.length,
    y: Array.from(touches).reduce((sum, touch) => sum + touch.clientY, 0) / touches.length,
  });

  const touchDistance = (touches: TouchPointList) => {
    if (touches.length < 2) return 0;
    const [first, second] = [touches[0], touches[1]];
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  };

  const handleStageTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) return;
    touchGestureRef.current = true;
    currentStrokeRef.current = [];
    setActiveStroke(null);
    if (liveStrokeIdRef.current) {
      syncContextRef.current?.liveStrokes.delete(liveStrokeIdRef.current);
      liveStrokeIdRef.current = "";
    }
    setActiveStrokeId("");
    setLassoPoints([]);
    selectionDragRef.current = null;
    resizeRef.current = null;
    const center = touchCenter(event.touches);
    panTouchRef.current = { ...center, distance: touchDistance(event.touches) };
  };

  const handleStageTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      if (
        roleRef.current === "student" &&
        studentViewModeRef.current === "follow"
      ) {
        event.preventDefault();
      }
      return;
    }
    if (!panTouchRef.current) return;
    event.preventDefault();
    if (
      roleRef.current === "student" &&
      studentViewModeRef.current === "follow"
    ) {
      return;
    }
    const center = touchCenter(event.touches);
    const distance = touchDistance(event.touches);
    const previousDistance = panTouchRef.current.distance;
    const scaleFactor = previousDistance > 0 ? distance / previousDistance : 1;
    const isPinching = Math.abs(scaleFactor - 1) > 0.008;
    const delta = {
      x: center.x - panTouchRef.current.x,
      y: center.y - panTouchRef.current.y,
    };
    panTouchRef.current = { ...center, distance };
    if (zoom <= 1.001 && !isPinching) {
      if (
        roleRef.current === "student" &&
        studentViewModeRef.current === "follow"
      ) {
        return;
      }
      stageRef.current?.scrollBy({ top: -delta.y, left: -delta.x });
      return;
    }
    if (previousDistance > 0 && distance > 0) {
      setZoom((current) => {
        const next = Math.min(1.6, Math.max(0.7, Number((current * scaleFactor).toFixed(2))));
        if (next <= 1) setPan({ x: 0, y: 0 });
        return next;
      });
    }
    setPan((current) => ({
      x: Math.max(-520, Math.min(520, current.x + delta.x)),
      y: Math.max(-520, Math.min(520, current.y + delta.y)),
    }));
  };

  const handleStageTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) panTouchRef.current = null;
    if (event.touches.length === 0) touchGestureRef.current = false;
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
  }, [activeDocumentId, canEdit, images, pageNumber, paperSize.height, paperSize.width, pushHistory]);

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
        documentId?: string;
        base64?: string;
      };
      if (!parsed.name || !parsed.base64) return;
      const file = new File([base64ToArrayBuffer(parsed.base64)], parsed.name, {
        type: parsed.type || "application/pdf",
      });
      window.setTimeout(
        () => void loadPdfFile(file, true, parsed.documentId),
        0,
      );
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
          textBoxes: doc.getMap("text-boxes"),
          liveStrokes: doc.getMap("live-strokes"),
          pdfMeta: doc.getMap("pdf-meta"),
          pdfChunks: doc.getMap("pdf-chunks"),
        };
        context = syncContext;
        syncContextRef.current = syncContext;
        setConnectionStatus("pairing");
        if (roleRef.current === "tutor") syncTutorViewport();

        const readAnnotations = () => {
          const next = Array.from(syncContext.annotations.values())
            .filter(
              (value): value is Annotation =>
                Boolean(value && typeof value === "object" && "id" in value),
            )
            .sort((left, right) => left.id.localeCompare(right.id));
          if (
            roleRef.current === "tutor" &&
            next.length === 0 &&
            annotationsRef.current.length > 0
          ) {
            return;
          }
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
          if (
            roleRef.current === "tutor" &&
            next.length === 0 &&
            imagesRef.current.length > 0
          ) {
            return;
          }
          setImages(next);
        };

        const readTextBoxes = () => {
          const next = Array.from(syncContext.textBoxes.values())
            .filter(
              (value): value is TextBox =>
                Boolean(
                  value &&
                    typeof value === "object" &&
                    "id" in value &&
                    "text" in value &&
                    "page" in value,
                ),
            )
            .sort((left, right) => left.id.localeCompare(right.id));
          if (
            roleRef.current === "tutor" &&
            next.length === 0 &&
            textBoxesRef.current.length > 0
          ) {
            return;
          }
          setTextBoxes(next);
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

        const readSession = (event?: Y.YMapEvent<unknown>) => {
          // Tutor viewport writes are already reflected locally. Re-reading one
          // here also runs the page restoration path, snapping scroll to page start.
          if (roleRef.current === "tutor" && event?.transaction.local) return;

          const sharedViewMode: StudentViewMode =
            syncContext.session.get("viewMode") === "free" ? "free" : "follow";
          const sharedCanEdit = syncContext.session.get("studentCanEdit") !== false;
          studentViewModeRef.current = sharedViewMode;
          studentCanEditRef.current = sharedCanEdit;
          setStudentViewMode(sharedViewMode);
          setStudentCanEdit(sharedCanEdit);

          const sharedZoom = Number(syncContext.session.get("viewportZoom"));
          const sharedPanX = Number(syncContext.session.get("viewportPanX"));
          const sharedPanY = Number(syncContext.session.get("viewportPanY"));
          const sharedScrollRatio = Number(
            syncContext.session.get("viewportScrollRatio"),
          );
          if (
            Number.isFinite(sharedZoom) &&
            Number.isFinite(sharedPanX) &&
            Number.isFinite(sharedPanY) &&
            Number.isFinite(sharedScrollRatio)
          ) {
            const sharedViewport: ViewportState = {
              zoom: Math.min(1.6, Math.max(0.7, sharedZoom)),
              panX: Math.min(520, Math.max(-520, sharedPanX)),
              panY: Math.min(520, Math.max(-520, sharedPanY)),
              scrollRatio: Math.min(1, Math.max(0, sharedScrollRatio)),
            };
            remoteViewportRef.current = sharedViewport;
            if (roleRef.current === "student" && sharedViewMode === "follow") {
              setZoom(sharedViewport.zoom);
              setPan({ x: sharedViewport.panX, y: sharedViewport.panY });
              window.requestAnimationFrame(restoreFollowScroll);
            }
          }

          const sharedDocumentKind = syncContext.session.get("documentKind");
          const sharedDocumentId = String(
            syncContext.session.get("documentId") ?? "sample",
          );
          if (
            roleRef.current === "student" &&
            (sharedDocumentKind === "blank" || sharedDocumentKind === "sample")
          ) {
            setActiveDocumentId(sharedDocumentId);
            const nextKind = sharedDocumentKind === "blank" ? "blank" : "sample";
            const nextName = nextKind === "blank" ? "Untitled notes" : "Sample tutoring worksheet";
            setDocumentKind(nextKind);
            setDocumentName(nextName);
            setPdfFile(null);
            pdfFileRef.current = null;
            pdfDocumentRef.current = null;
            pageCountRef.current = 1;
            setPageCount(1);
            setPageNumber(1);
            setPaperSize(DEFAULT_PAPER);
            const sharedDocument: OpenDocument = {
              id: sharedDocumentId,
              kind: nextKind,
              name: nextName,
              pageCount: 1,
            };
            setOpenDocuments((documents) => {
              const next = documents.some((document) => document.id === sharedDocumentId)
                ? documents.map((document) => document.id === sharedDocumentId ? sharedDocument : document)
                : [...documents, sharedDocument];
              openDocumentsRef.current = next;
              return next;
            });
          }

          if (roleRef.current === "student" && sharedDocumentKind === "pdf") {
            const sharedDocument = openDocumentsRef.current.find(
              (document) => document.id === sharedDocumentId,
            );
            if (
              sharedDocument?.kind === "pdf" &&
              sharedDocument.document &&
              activeDocumentIdRef.current !== sharedDocumentId
            ) {
              setActiveDocumentId(sharedDocumentId);
              setDocumentKind("pdf");
              setDocumentName(sharedDocument.name);
              setPdfFile(sharedDocument.file ?? null);
              pdfFileRef.current = sharedDocument.file ?? null;
              pdfDocumentRef.current = sharedDocument.document;
              pageCountRef.current = sharedDocument.pageCount;
              setPageCount(sharedDocument.pageCount);
              setPdfPagePreviews([]);
              setSelectedIds([]);
              setHistory([]);
              setFuture([]);
              void renderPdfPage(sharedDocument.document, 1);
              void renderPdfPages(sharedDocument.document);
            }
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
            setPan({ x: 0, y: 0 });
            if (roleRef.current === "student" && sharedViewMode === "follow") {
              window.requestAnimationFrame(restoreFollowScroll);
            } else {
              window.requestAnimationFrame(() => {
                pageElementsRef.current.get(sharedPage)?.scrollIntoView({
                  behavior: "auto",
                  block: "start",
                });
              });
            }
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
        syncContext.textBoxes.observe(readTextBoxes);
        syncContext.liveStrokes.observe(readLiveStrokes);
        syncContext.session.observe(readSession);
        syncContext.pdfMeta.observe(readPdf);
        syncContext.pdfChunks.observe(readPdf);
        provider.on("status", handleStatus);
        provider.on("peers", handlePeers);
        readAnnotations();
        readImages();
        readTextBoxes();
        readLiveStrokes();
        readSession();
        readPdf();
        if (roleRef.current === "tutor") {
          const initialDocument = openDocumentsRef.current.find(
            (document) => document.id === activeDocumentIdRef.current,
          ) ?? openDocumentsRef.current[0];
          if (!syncContext.session.has("documentKind")) {
            syncContext.session.set("documentKind", initialDocument?.kind ?? "blank");
          }
          if (!syncContext.session.has("documentId")) {
            syncContext.session.set("documentId", initialDocument?.id ?? "");
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
  }, [loadPdfFile, publishPdf, renderPdfPage, renderPdfPages, restoreFollowScroll, sessionCode, syncTutorViewport]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visiblePage = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (!visiblePage) return;
        const nextPage = Number((visiblePage.target as HTMLElement).dataset.page);
        if (!Number.isInteger(nextPage) || nextPage === pageNumber) return;
        setPageNumber(nextPage);
        activePointerPageRef.current = nextPage;
        setSelectedIds([]);
        if (roleRef.current === "tutor") {
          syncContextRef.current?.session.set("page", nextPage);
        }
      },
      { root: stage, rootMargin: "-35% 0px -35% 0px", threshold: [0.25, 0.5, 0.75] },
    );
    pageElementsRef.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [activeDocumentId, documentKind, pageNumber, pdfPagePreviews.length]);

  const pointFromClient = (
    event: Pick<PointerEvent<SVGElement>, "clientX" | "clientY">,
    element: SVGSVGElement,
  ) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  };

  const pointFromEvent = (event: PointerEvent<SVGSVGElement>) =>
    pointFromClient(event, event.currentTarget);

  const pointDistance = (left: Point, right: Point) =>
    Math.hypot(left.x - right.x, left.y - right.y);

  const selectedObjectAt = (point: Point, targetPage = pageNumber) => {
    const image = [...images]
      .reverse()
      .find(
        (candidate) =>
          candidate.documentId === activeDocumentId &&
          candidate.page === targetPage &&
          point.x >= candidate.x &&
          point.x <= candidate.x + candidate.width &&
          point.y >= candidate.y &&
          point.y <= candidate.y + candidate.height,
      );
    if (image) return image.id;

    const textBox = [...textBoxes]
      .reverse()
      .find(
        (candidate) =>
          candidate.documentId === activeDocumentId &&
          candidate.page === targetPage &&
          point.x >= candidate.x &&
          point.x <= candidate.x + candidate.width &&
          point.y >= candidate.y &&
          point.y <= candidate.y + candidate.height,
      );
    if (textBox) return textBox.id;

    const annotation = [...annotations]
      .reverse()
      .find(
        (candidate) =>
          candidate.documentId === activeDocumentId &&
          candidate.page === targetPage &&
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

  const getSelectionBounds = (targetPage: number): SelectionBounds | null => {
    const selectedAnnotations = annotations.filter(
      (annotation) =>
        annotation.documentId === activeDocumentId &&
        annotation.page === targetPage &&
        selectedIds.includes(annotation.id),
    );
    const selectedImages = images.filter(
      (image) =>
        image.documentId === activeDocumentId &&
        image.page === targetPage &&
        selectedIds.includes(image.id),
    );
    const selectedTextBoxes = textBoxes.filter(
      (textBox) =>
        textBox.documentId === activeDocumentId &&
        textBox.page === targetPage &&
        selectedIds.includes(textBox.id),
    );
    const points = selectedAnnotations.flatMap((annotation) =>
      getAnnotationSegments(annotation).flat(),
    );
    const minX = Math.min(
      ...points.map((point) => point.x),
      ...selectedImages.map((image) => image.x),
      ...selectedImages.map((image) => image.x + image.width),
      ...selectedTextBoxes.map((textBox) => textBox.x),
      ...selectedTextBoxes.map((textBox) => textBox.x + textBox.width),
    );
    const minY = Math.min(
      ...points.map((point) => point.y),
      ...selectedImages.map((image) => image.y),
      ...selectedImages.map((image) => image.y + image.height),
      ...selectedTextBoxes.map((textBox) => textBox.y),
      ...selectedTextBoxes.map((textBox) => textBox.y + textBox.height),
    );
    const maxX = Math.max(
      ...points.map((point) => point.x),
      ...selectedImages.map((image) => image.x),
      ...selectedImages.map((image) => image.x + image.width),
      ...selectedTextBoxes.map((textBox) => textBox.x),
      ...selectedTextBoxes.map((textBox) => textBox.x + textBox.width),
    );
    const maxY = Math.max(
      ...points.map((point) => point.y),
      ...selectedImages.map((image) => image.y),
      ...selectedImages.map((image) => image.y + image.height),
      ...selectedTextBoxes.map((textBox) => textBox.y),
      ...selectedTextBoxes.map((textBox) => textBox.y + textBox.height),
    );
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    const x = Math.max(0, minX - 0.02);
    const y = Math.max(0, minY - 0.02);
    const right = Math.min(1, Math.max(maxX + 0.02, x + 0.04));
    const bottom = Math.min(1, Math.max(maxY + 0.02, y + 0.04));
    return { x, y, width: right - x, height: bottom - y };
  };

  const resizeAnnotation = (
    annotation: Annotation,
    bounds: SelectionBounds,
    scaleX: number,
    scaleY: number,
  ): Annotation => ({
    ...annotation,
    points: annotation.points.map((point) => ({
      x: clamp(bounds.x + (point.x - bounds.x) * scaleX),
      y: clamp(bounds.y + (point.y - bounds.y) * scaleY),
    })),
    segments: annotation.segments?.map((segment) =>
      segment.map((point) => ({
        x: clamp(bounds.x + (point.x - bounds.x) * scaleX),
        y: clamp(bounds.y + (point.y - bounds.y) * scaleY),
      })),
    ),
  });

  const resizeImages = (
    image: PageImage,
    bounds: SelectionBounds,
    scaleX: number,
    scaleY: number,
  ): PageImage => ({
    ...image,
    x: clamp(bounds.x + (image.x - bounds.x) * scaleX),
    y: clamp(bounds.y + (image.y - bounds.y) * scaleY),
    width: Math.max(0.02, Math.min(1, image.width * scaleX)),
    height: Math.max(0.02, Math.min(1, image.height * scaleY)),
  });

  const translateTextBox = (textBox: TextBox, delta: Point): TextBox => ({
    ...textBox,
    x: clamp(textBox.x + delta.x),
    y: clamp(textBox.y + delta.y),
  });

  const resizeTextBox = (
    textBox: TextBox,
    bounds: SelectionBounds,
    scaleX: number,
    scaleY: number,
  ): TextBox => ({
    ...textBox,
    x: clamp(bounds.x + (textBox.x - bounds.x) * scaleX),
    y: clamp(bounds.y + (textBox.y - bounds.y) * scaleY),
    width: Math.max(0.08, Math.min(1, textBox.width * scaleX)),
    height: Math.max(0.05, Math.min(1, textBox.height * scaleY)),
    fontSize: Math.max(0.012, Math.min(0.08, textBox.fontSize * Math.max(scaleX, scaleY))),
  });

  const handleResizeStart = (
    event: PointerEvent<SVGGElement>,
    targetPage: number,
  ) => {
    if (!canEdit || selectedIds.length === 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const svg = event.currentTarget.closest("svg");
    if (!(svg instanceof SVGSVGElement)) return;
    const bounds = getSelectionBounds(targetPage);
    if (!bounds) return;
    const point = pointFromClient(event, svg);
    resizeRef.current = {
      start: point,
      current: point,
      bounds,
      annotations: annotations.filter(
        (annotation) =>
          annotation.documentId === activeDocumentId &&
          annotation.page === targetPage &&
          selectedIds.includes(annotation.id),
      ),
      images: images.filter(
        (image) =>
          image.documentId === activeDocumentId &&
          image.page === targetPage &&
          selectedIds.includes(image.id),
      ),
      textBoxes: textBoxes.filter(
        (textBox) =>
          textBox.documentId === activeDocumentId &&
          textBox.page === targetPage &&
          selectedIds.includes(textBox.id),
      ),
    };
  };

  const updateLiveStroke = (points: Point[], strokePage = activePointerPageRef.current) => {
    const liveId = liveStrokeIdRef.current;
    if (!liveId) return;
    const liveStroke: Annotation = {
      id: liveId,
      documentId: activeDocumentId,
      page: strokePage,
      points,
      segments: [points],
      color: inkColor,
      width: activeTool === "highlighter" ? highlighterWidth : inkWidth,
      opacity: activeTool === "highlighter" ? 0.28 : 0.92,
      author: role,
    };
    syncContextRef.current?.liveStrokes.set(liveId, liveStroke);
  };

  const updateLiveLaser = (points: Point[], laserPage = activePointerPageRef.current) => {
    const liveId = liveStrokeIdRef.current;
    if (!liveId) return;
    const laserStroke: Annotation = {
      id: liveId,
      documentId: activeDocumentId,
      page: laserPage,
      points,
      color: "#ff3f54",
      width: 0.014,
      opacity: 0.96,
      author: role,
      kind: "laser",
      laserMode,
    };
    syncContextRef.current?.liveStrokes.set(liveId, laserStroke);
  };

  const finishLaser = () => {
    const liveId = liveStrokeIdRef.current;
    const points = currentStrokeRef.current;
    const laser = activeLaserRef.current;
    currentStrokeRef.current = [];
    liveStrokeIdRef.current = "";
    activeLaserRef.current = null;
    setActiveLaser(null);
    setActiveStrokeId("");
    if (!liveId) return;
    if (points.length < 2) {
      syncContextRef.current?.liveStrokes.delete(liveId);
      return;
    }
    syncContextRef.current?.liveStrokes.set(liveId, {
      id: liveId,
      documentId: laser?.documentId ?? activeDocumentId,
      page: laser?.page ?? activePointerPageRef.current,
      points,
      color: "#ff3f54",
      width: 0.008,
      opacity: 0.96,
      author: role,
      kind: "laser",
      laserMode: laser?.mode ?? laserMode,
      laserFadeUntil: 1,
    } satisfies Annotation);
    laserTimeoutRef.current = window.setTimeout(() => {
      syncContextRef.current?.liveStrokes.delete(liveId);
      laserTimeoutRef.current = null;
    }, 900);
  };

  const eraseAt = (point: Point, erasePage = activePointerPageRef.current) => {
    if (!canEdit) return;
    const hit = [...annotations].reverse().find(
      (annotation) =>
        annotation.documentId === activeDocumentId &&
        annotation.page === erasePage &&
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

  const updateTextBox = (textBoxId: string, value: string) => {
    const nextTextBoxes = textBoxes.map((textBox) =>
      textBox.id === textBoxId ? { ...textBox, text: value } : textBox,
    );
    setTextBoxes(nextTextBoxes);
    const nextTextBox = nextTextBoxes.find((textBox) => textBox.id === textBoxId);
    if (nextTextBox) syncContextRef.current?.textBoxes.set(textBoxId, nextTextBox);
  };

  const finishTextEditing = (textBoxId: string) => {
    const textBox = textBoxes.find((candidate) => candidate.id === textBoxId);
    if (textBox && !textBox.text.trim()) {
      const nextTextBoxes = textBoxes.filter((candidate) => candidate.id !== textBoxId);
      setTextBoxes(nextTextBoxes);
      replaceSharedContent(annotations, images, nextTextBoxes);
      setSelectedIds([]);
    }
    setEditingTextId(null);
  };

  const updateSelectedTextBoxes = (updates: Partial<Pick<TextBox, "color" | "fontSize">>) => {
    const selectedTextBoxIds = new Set(
      textBoxes
        .filter((textBox) => selectedIds.includes(textBox.id))
        .map((textBox) => textBox.id),
    );
    if (selectedTextBoxIds.size === 0) return;
    const nextTextBoxes = textBoxes.map((textBox) =>
      selectedTextBoxIds.has(textBox.id) ? { ...textBox, ...updates } : textBox,
    );
    setTextBoxes(nextTextBoxes);
    replaceSharedContent(annotations, images, nextTextBoxes);
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!canEdit) return;
    if (event.pointerType === "touch" && touchGestureRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    const targetPage = Number(event.currentTarget.dataset.page) || pageNumber;
    activePointerPageRef.current = targetPage;
    setPageNumber(targetPage);

    if (activeTool === "text") {
      const existingTextBox = textBoxes.find(
        (textBox) =>
          textBox.documentId === activeDocumentId &&
          textBox.page === targetPage &&
          point.x >= textBox.x &&
          point.x <= textBox.x + textBox.width &&
          point.y >= textBox.y &&
          point.y <= textBox.y + textBox.height,
      );
      if (existingTextBox) {
        setInkColor(existingTextBox.color);
        setTextFontSize(existingTextBox.fontSize);
        setEditingTextId(existingTextBox.id);
        return;
      }
      const textBox: TextBox = {
        id: createTextBoxId(),
        documentId: activeDocumentId,
        page: targetPage,
        text: "",
        x: Math.min(0.72, point.x),
        y: Math.min(0.88, point.y),
        width: 0.28,
        height: 0.12,
        color: inkColor,
        fontSize: textFontSize,
        author: role,
      };
      pushHistory();
      const nextTextBoxes = [...textBoxes, textBox];
      setTextBoxes(nextTextBoxes);
      syncContextRef.current?.textBoxes.set(textBox.id, textBox);
      setSelectedIds([textBox.id]);
      setEditingTextId(textBox.id);
      return;
    }

    if (activeTool === "select") {
      const selectedId = selectedObjectAt(point, targetPage);
      const currentBounds = selectedIds.length > 0 ? getSelectionBounds(targetPage) : null;
      const pointInsideSelection = Boolean(
        currentBounds &&
          point.x >= currentBounds.x &&
          point.x <= currentBounds.x + currentBounds.width &&
          point.y >= currentBounds.y &&
          point.y <= currentBounds.y + currentBounds.height,
      );
      if (!selectedId && !pointInsideSelection) {
        setSelectedIds([]);
        setLassoPoints([point]);
        selectionDragRef.current = {
          mode: "lasso",
          page: targetPage,
          start: point,
          current: point,
          annotations: [],
          images: [],
          textBoxes: [],
          moved: false,
          lassoPoints: [point],
        };
        return;
      }
      const keepCurrentSelection =
        pointInsideSelection || (selectedId !== null && selectedIds.includes(selectedId));
      const nextSelection = keepCurrentSelection
        ? selectedIds
        : event.shiftKey && selectedId && selectedIds.includes(selectedId)
          ? selectedIds.filter((id) => id !== selectedId)
          : event.shiftKey && selectedId
            ? [...selectedIds, selectedId]
            : selectedId
              ? [selectedId]
              : selectedIds;
      setSelectedIds(nextSelection);
      selectionDragRef.current = {
        mode: "move",
        page: targetPage,
        start: point,
        current: point,
        annotations: annotations.filter(
          (annotation) =>
            annotation.documentId === activeDocumentId &&
            annotation.page === targetPage &&
            nextSelection.includes(annotation.id),
        ),
        images: images.filter(
          (image) =>
            image.documentId === activeDocumentId &&
            image.page === targetPage &&
            nextSelection.includes(image.id),
        ),
        textBoxes: textBoxes.filter(
          (textBox) =>
            textBox.documentId === activeDocumentId &&
            textBox.page === targetPage &&
            nextSelection.includes(textBox.id),
        ),
        moved: false,
        lassoPoints: [],
      };
      return;
    }

    if (activeTool === "eraser") {
      setEraserCursor({ page: targetPage, point });
      eraserGestureHasHistoryRef.current = false;
      eraseAt(point, targetPage);
      return;
    }

    if (activeTool === "laser") {
      currentStrokeRef.current = [point];
      const laserStroke: LaserStroke = {
        id: createAnnotationId(),
        documentId: activeDocumentId,
        page: targetPage,
        points: [point],
        mode: laserMode,
        author: role,
      };
      liveStrokeIdRef.current = laserStroke.id;
      activeLaserRef.current = laserStroke;
      setActiveLaser(laserStroke);
      setActiveStrokeId(laserStroke.id);
      updateLiveLaser([point], targetPage);
      return;
    }

    currentStrokeRef.current = [point];
    liveStrokeIdRef.current = createAnnotationId();
    setActiveStrokePage(targetPage);
    setActiveStrokeId(liveStrokeIdRef.current);
    setActiveStroke([point]);
    updateLiveStroke([point], targetPage);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "touch" && touchGestureRef.current) return;
    const point = pointFromEvent(event);
    if (activeTool === "select") {
      const resize = resizeRef.current;
      if (resize) {
        resize.current = point;
        const scaleX = Math.min(4, Math.max(0.2, (point.x - resize.bounds.x) / Math.max(resize.bounds.width, 0.04)));
        const scaleY = Math.min(4, Math.max(0.2, (point.y - resize.bounds.y) / Math.max(resize.bounds.height, 0.04)));
        const selectedAnnotationIds = new Set(resize.annotations.map((annotation) => annotation.id));
        const selectedImageIds = new Set(resize.images.map((image) => image.id));
        const selectedTextBoxIds = new Set(resize.textBoxes.map((textBox) => textBox.id));
        setAnnotations((current) =>
          current.map((annotation) =>
            selectedAnnotationIds.has(annotation.id)
              ? resizeAnnotation(
                  resize.annotations.find((item) => item.id === annotation.id) ?? annotation,
                  resize.bounds,
                  scaleX,
                  scaleY,
                )
              : annotation,
          ),
        );
        setImages((current) =>
          current.map((image) =>
            selectedImageIds.has(image.id)
              ? resizeImages(
                  resize.images.find((item) => item.id === image.id) ?? image,
                  resize.bounds,
                  scaleX,
                  scaleY,
                )
              : image,
          ),
        );
        setTextBoxes((current) =>
          current.map((textBox) =>
            selectedTextBoxIds.has(textBox.id)
              ? resizeTextBox(
                  resize.textBoxes.find((item) => item.id === textBox.id) ?? textBox,
                  resize.bounds,
                  scaleX,
                  scaleY,
                )
              : textBox,
          ),
        );
        return;
      }
      const drag = selectionDragRef.current;
      if (!drag) return;
      if (drag.mode === "lasso") {
        drag.current = point;
        drag.lassoPoints = [...drag.lassoPoints, point];
        setLassoPoints(drag.lassoPoints);
        return;
      }
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
      setTextBoxes((current) =>
        current.map((textBox) => {
          const initial = drag.textBoxes.find((item) => item.id === textBox.id);
          if (!initial) return textBox;
          return translateTextBox(initial, delta);
        }),
      );
      return;
    }
    if (activeTool === "eraser") {
      setEraserCursor({ page: activePointerPageRef.current, point });
      if (event.buttons !== 0) eraseAt(point);
      return;
    }
    if (activeTool === "laser") {
      if (currentStrokeRef.current.length === 0) return;
      const nextPoints = [...currentStrokeRef.current, point];
      currentStrokeRef.current = nextPoints;
      const nextLaser: LaserStroke = {
        ...(activeLaserRef.current ?? {
          id: liveStrokeIdRef.current,
          documentId: activeDocumentId,
          page: activePointerPageRef.current,
          mode: laserMode,
          author: role,
        }),
        points: nextPoints,
      };
      activeLaserRef.current = nextLaser;
      setActiveLaser(nextLaser);
      updateLiveLaser(nextPoints);
      return;
    }
    if (currentStrokeRef.current.length === 0) return;
    const nextPoints = [...currentStrokeRef.current, point];
    currentStrokeRef.current = nextPoints;
    setActiveStroke(nextPoints);
    updateLiveStroke(nextPoints);
  };

  const handlePointerUp = (event?: PointerEvent<SVGSVGElement>) => {
    if (event?.pointerType === "touch" && touchGestureRef.current) return;
    if (activeTool === "select") {
      const resize = resizeRef.current;
      if (resize) {
        const scaleX = Math.min(4, Math.max(0.2, (resize.current.x - resize.bounds.x) / Math.max(resize.bounds.width, 0.04)));
        const scaleY = Math.min(4, Math.max(0.2, (resize.current.y - resize.bounds.y) / Math.max(resize.bounds.height, 0.04)));
        const selectedAnnotationIds = new Set(resize.annotations.map((annotation) => annotation.id));
        const selectedImageIds = new Set(resize.images.map((image) => image.id));
        const selectedTextBoxIds = new Set(resize.textBoxes.map((textBox) => textBox.id));
        const nextAnnotations = annotations.map((annotation) =>
          selectedAnnotationIds.has(annotation.id)
            ? resizeAnnotation(
                resize.annotations.find((item) => item.id === annotation.id) ?? annotation,
                resize.bounds,
                scaleX,
                scaleY,
              )
            : annotation,
        );
        const nextImages = images.map((image) =>
          selectedImageIds.has(image.id)
            ? resizeImages(
                resize.images.find((item) => item.id === image.id) ?? image,
                resize.bounds,
                scaleX,
                scaleY,
              )
            : image,
        );
        const nextTextBoxes = textBoxes.map((textBox) =>
          selectedTextBoxIds.has(textBox.id)
            ? resizeTextBox(
                resize.textBoxes.find((item) => item.id === textBox.id) ?? textBox,
                resize.bounds,
                scaleX,
                scaleY,
              )
            : textBox,
        );
        pushHistory();
        setAnnotations(nextAnnotations);
        setImages(nextImages);
        setTextBoxes(nextTextBoxes);
        replaceSharedContent(nextAnnotations, nextImages, nextTextBoxes);
        resizeRef.current = null;
        return;
      }
      const drag = selectionDragRef.current;
      if (drag?.mode === "lasso") {
        const polygon = drag.lassoPoints;
        if (polygon.length >= 3) {
          const nextSelection = [
            ...annotations
              .filter(
                (annotation) =>
                  annotation.documentId === activeDocumentId &&
                  annotation.page === drag.page &&
                  getAnnotationSegments(annotation).some((segment) =>
                    segment.some((point) => pointInPolygon(point, polygon)),
                  ),
              )
              .map((annotation) => annotation.id),
            ...images
              .filter(
                (image) =>
                  image.documentId === activeDocumentId &&
                  image.page === drag.page &&
                  rectIntersectsPolygon(
                    { x: image.x, y: image.y, width: image.width, height: image.height },
                    polygon,
                  ),
              )
              .map((image) => image.id),
            ...textBoxes
              .filter(
                (textBox) =>
                  textBox.documentId === activeDocumentId &&
                  textBox.page === drag.page &&
                  rectIntersectsPolygon(
                    { x: textBox.x, y: textBox.y, width: textBox.width, height: textBox.height },
                    polygon,
                  ),
              )
              .map((textBox) => textBox.id),
          ];
          setSelectedIds(nextSelection);
          if (nextSelection.length === 0) setNotice("No objects were inside that selection.");
        }
        setLassoPoints([]);
        selectionDragRef.current = null;
        return;
      }
      if (drag?.moved) {
        const delta = {
          x: drag.current.x - drag.start.x,
          y: drag.current.y - drag.start.y,
        };
        const selectedAnnotationIds = new Set(
          drag.annotations.map((annotation) => annotation.id),
        );
        const selectedImageIds = new Set(drag.images.map((image) => image.id));
        const selectedTextBoxIds = new Set(drag.textBoxes.map((textBox) => textBox.id));
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
        const nextTextBoxes = textBoxes.map((textBox) =>
          selectedTextBoxIds.has(textBox.id)
            ? translateTextBox(
                drag.textBoxes.find((item) => item.id === textBox.id) ?? textBox,
                delta,
              )
            : textBox,
        );
        pushHistory();
        setAnnotations(nextAnnotations);
        setImages(nextImages);
        setTextBoxes(nextTextBoxes);
        replaceSharedContent(nextAnnotations, nextImages, nextTextBoxes);
      }
      selectionDragRef.current = null;
      return;
    }
    if (activeTool === "eraser") {
      eraserGestureHasHistoryRef.current = false;
      return;
    }
    if (activeTool === "laser") {
      finishLaser();
      return;
    }
    finishStroke();
  };

  const handlePointerLeave = () => {
    if (activeTool === "eraser") setEraserCursor(null);
  };

  const finishStroke = () => {
    if (currentStrokeRef.current.length < 2) {
      currentStrokeRef.current = [];
      setActiveStroke(null);
      if (liveStrokeIdRef.current) {
        syncContextRef.current?.liveStrokes.delete(liveStrokeIdRef.current);
        liveStrokeIdRef.current = "";
      }
      setActiveStrokeId("");
      return;
    }

    const annotation: Annotation = {
      id: createAnnotationId(),
      documentId: activeDocumentId,
      page: activePointerPageRef.current,
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
    setActiveStrokeId("");
    activeLaserRef.current = null;
    setActiveLaser(null);
    currentStrokeRef.current = [];
    setActiveStroke(null);
  };

  const undo = () => {
    if (!canEdit) return;
    const previous = history.at(-1);
    if (!previous) return;
    const current = { annotations, images, textBoxes };
    setFuture((items) => [...items, current]);
    setAnnotations(previous.annotations);
    setImages(previous.images);
    setTextBoxes(previous.textBoxes);
    setHistory((items) => items.slice(0, -1));
    replaceSharedContent(previous.annotations, previous.images, previous.textBoxes);
  };

  const redo = () => {
    if (!canEdit) return;
    const next = future.at(-1);
    if (!next) return;
    const current = { annotations, images, textBoxes };
    setHistory((items) => [...items, current]);
    setAnnotations(next.annotations);
    setImages(next.images);
    setTextBoxes(next.textBoxes);
    setFuture((items) => items.slice(0, -1));
    replaceSharedContent(next.annotations, next.images, next.textBoxes);
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
    const pageTextBoxes = textBoxes.filter(
      (textBox) => textBox.documentId === activeDocumentId && textBox.page === pageNumber,
    );
    if (pageAnnotations.length === 0 && pageImages.length === 0 && pageTextBoxes.length === 0) return;
    const nextAnnotations = annotations.filter(
      (annotation) =>
        annotation.documentId !== activeDocumentId || annotation.page !== pageNumber,
    );
    const nextImages = images.filter(
      (image) => image.documentId !== activeDocumentId || image.page !== pageNumber,
    );
    const nextTextBoxes = textBoxes.filter(
      (textBox) => textBox.documentId !== activeDocumentId || textBox.page !== pageNumber,
    );
    pushHistory();
    setAnnotations(nextAnnotations);
    setImages(nextImages);
    setTextBoxes(nextTextBoxes);
    replaceSharedContent(nextAnnotations, nextImages, nextTextBoxes);
    setNotice(`Ink, images, and text cleared from page ${pageNumber}.`);
  };

  const deleteSelection = () => {
    if (!canEdit || selectedIds.length === 0) return;
    const nextAnnotations = annotations.filter(
      (annotation) => !selectedIds.includes(annotation.id),
    );
    const nextImages = images.filter((image) => !selectedIds.includes(image.id));
    const nextTextBoxes = textBoxes.filter((textBox) => !selectedIds.includes(textBox.id));
    pushHistory();
    setAnnotations(nextAnnotations);
    setImages(nextImages);
    setTextBoxes(nextTextBoxes);
    setSelectedIds([]);
    replaceSharedContent(nextAnnotations, nextImages, nextTextBoxes);
    setNotice("Selected content deleted.");
  };

  const updateStudentViewMode = (nextMode: StudentViewMode) => {
    if (role !== "tutor") return;
    studentViewModeRef.current = nextMode;
    setStudentViewMode(nextMode);
    syncContextRef.current?.session.set("viewMode", nextMode);
    if (nextMode === "follow") {
      window.requestAnimationFrame(restoreFollowScroll);
    }
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
    window.history.replaceState(
      null,
      "",
      `/tutoring?room=${nextCode}&role=tutor`,
    );
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

  const exportAnnotatedPdf = async (
    targetDocumentId = activeDocumentId,
    requestedName = "",
  ): Promise<boolean> => {
    if (pdfLoading) return false;

    const targetDocument = openDocumentsRef.current.find(
      (document) => document.id === targetDocumentId,
    );
    const targetKind = targetDocument?.kind ?? documentKind;
    const targetPdfFile = targetDocument?.file ?? (targetDocumentId === activeDocumentId ? pdfFile : null);
    const targetName = targetDocument?.name ?? documentName;

    const drawAnnotations = (
      context: CanvasRenderingContext2D,
      pageAnnotations: Annotation[],
      width: number,
      height: number,
    ) => {
      pageAnnotations.forEach((annotation) => {
        context.save();
        context.beginPath();
        getAnnotationSegments(annotation).forEach((segment) => {
          if (segment.length === 0) return;
          context.moveTo(segment[0].x * width, segment[0].y * height);
          segment.slice(1).forEach((point) => {
            context.lineTo(point.x * width, point.y * height);
          });
        });
        context.strokeStyle = annotation.color;
        context.lineWidth = annotation.width * height;
        context.globalAlpha = annotation.opacity;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.stroke();
        context.restore();
      });
    };

    const drawTextBoxes = (
      context: CanvasRenderingContext2D,
      pageTextBoxes: TextBox[],
      width: number,
      height: number,
    ) => {
      pageTextBoxes.forEach((textBox) => {
        const fontSize = Math.max(8, textBox.fontSize * width);
        const lineHeight = fontSize * 1.25;
        const maxWidth = textBox.width * width;
        const maxHeight = textBox.height * height;
        const lines: string[] = [];
        context.save();
        context.font = `${fontSize}px Arial, sans-serif`;
        textBox.text.split("\n").forEach((paragraph) => {
          const words = paragraph.split(/\s+/).filter(Boolean);
          let line = "";
          if (words.length === 0) lines.push("");
          words.forEach((word) => {
            const candidate = line ? `${line} ${word}` : word;
            if (line && context.measureText(candidate).width > maxWidth) {
              lines.push(line);
              line = word;
            } else {
              line = candidate;
            }
          });
          if (line) lines.push(line);
        });
        context.beginPath();
        context.rect(textBox.x * width, textBox.y * height, maxWidth, maxHeight);
        context.clip();
        context.fillStyle = textBox.color;
        lines.forEach((line, index) => {
          const y = textBox.y * height + index * lineHeight;
          if (y + lineHeight <= textBox.y * height + maxHeight) {
            context.fillText(line, textBox.x * width, y);
          }
        });
        context.restore();
      });
    };

    const loadImage = (source: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Image could not be loaded"));
        image.src = source;
      });

    try {
      const rasterPages: RasterPdfPage[] = [];
      if (targetKind === "pdf" && targetPdfFile) {
        const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();
        const data = await targetPdfFile.arrayBuffer();
        const pdfDocument = await pdfjs.getDocument({ data }).promise;

        for (let currentPage = 1; currentPage <= pdfDocument.numPages; currentPage += 1) {
          const page = await pdfDocument.getPage(currentPage);
          const pageSize = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: 2.2 });
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) continue;
          await page.render({ canvasContext: context, viewport }).promise;

          const pageImages = images.filter(
            (image) =>
              image.documentId === targetDocumentId && image.page === currentPage,
          );
          for (const image of pageImages) {
            const imageElement = await loadImage(image.src);
            context.drawImage(
              imageElement,
              image.x * canvas.width,
              image.y * canvas.height,
              image.width * canvas.width,
              image.height * canvas.height,
            );
          }

          drawAnnotations(
            context,
            annotations.filter(
              (annotation) =>
                annotation.documentId === targetDocumentId &&
                annotation.page === currentPage,
            ),
            canvas.width,
            canvas.height,
          );
          drawTextBoxes(
            context,
            textBoxes.filter(
              (textBox) =>
                textBox.documentId === targetDocumentId &&
                textBox.page === currentPage,
            ),
            canvas.width,
            canvas.height,
          );
          if (targetDocumentId === activeDocumentId && currentPage === activePointerPageRef.current && activeStroke?.length) {
            drawAnnotations(
              context,
              [{
                id: "active-export-stroke",
                documentId: targetDocumentId,
                page: currentPage,
                points: activeStroke,
                segments: [activeStroke],
                color: inkColor,
                width: activeTool === "highlighter" ? highlighterWidth : inkWidth,
                opacity: activeTool === "highlighter" ? 0.28 : 0.92,
                author: role,
              }],
              canvas.width,
              canvas.height,
            );
          }

          rasterPages.push({
            bytes: dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.97)),
            width: pageSize.width,
            height: pageSize.height,
            pixelWidth: canvas.width,
            pixelHeight: canvas.height,
          });
        }
      } else {
        const canvas = window.document.createElement("canvas");
        canvas.width = 1224;
        canvas.height = 1584;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable");
        context.fillStyle = "#fffefa";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const pageImages = images.filter(
          (image) => image.documentId === targetDocumentId && image.page === 1,
        );
        for (const image of pageImages) {
          const imageElement = await loadImage(image.src);
          context.drawImage(
            imageElement,
            image.x * canvas.width,
            image.y * canvas.height,
            image.width * canvas.width,
            image.height * canvas.height,
          );
        }
        drawAnnotations(
          context,
          annotations.filter(
            (annotation) =>
              annotation.documentId === targetDocumentId && annotation.page === 1,
          ),
          canvas.width,
          canvas.height,
        );
        drawTextBoxes(
          context,
          textBoxes.filter(
            (textBox) =>
              textBox.documentId === targetDocumentId && textBox.page === 1,
          ),
          canvas.width,
          canvas.height,
        );
        rasterPages.push({
          bytes: dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.97)),
          width: DEFAULT_PAPER.width,
          height: DEFAULT_PAPER.height,
          pixelWidth: canvas.width,
          pixelHeight: canvas.height,
        });
      }

      if (rasterPages.length === 0) throw new Error("No pages to export");
      const blob = new Blob([buildRasterPdf(rasterPages)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = getExportFileName(requestedName, targetName);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Annotated PDF exported.");
      return true;
    } catch {
      setNotice("The annotated PDF could not be exported.");
      return false;
    }
  };

  const removeDocument = (documentId: string) => {
    if (role !== "tutor") return;
    const closingDocument = openDocumentsRef.current.find(
      (document) => document.id === documentId,
    );
    if (!closingDocument) return;

    const nextDocuments = openDocumentsRef.current.filter(
      (document) => document.id !== documentId,
    );
    if (nextDocuments.length === 0) {
      nextDocuments.push({
        id: createDocumentId(),
        kind: "blank",
        name: "Untitled notes",
        pageCount: 1,
      });
    }
    const nextAnnotations = annotations.filter(
      (annotation) => annotation.documentId !== documentId,
    );
    const nextImages = images.filter((image) => image.documentId !== documentId);
    const nextTextBoxes = textBoxes.filter((textBox) => textBox.documentId !== documentId);
    openDocumentsRef.current = nextDocuments;
    setOpenDocuments(nextDocuments);
    setAnnotations(nextAnnotations);
    setImages(nextImages);
    setTextBoxes(nextTextBoxes);
    setHistory([]);
    setFuture([]);
    const isClosingActivePdf =
      closingDocument.kind === "pdf" &&
      activeDocumentIdRef.current === closingDocument.id;
    if (isClosingActivePdf) {
      pdfFileRef.current = null;
      pdfDocumentRef.current = null;
      setPdfFile(null);
      window.localStorage.removeItem(PDF_STORAGE_KEY);
    }
    if (closingDocument.kind === "sample") {
      window.localStorage.setItem(SAMPLE_DISMISSED_KEY, "true");
    }

    if (activeDocumentId === documentId) {
      activateDocument(nextDocuments[0].id);
    }
    replaceSharedContent(nextAnnotations, nextImages, nextTextBoxes);
    setCloseDocumentId(null);
    setNotice(`${closingDocument.name} and its annotations were closed permanently.`);
  };

  const requestCloseDocument = (documentId: string) => {
    if (role !== "tutor") return;
    const document = openDocumentsRef.current.find((item) => item.id === documentId);
    if (document) setCloseDocumentId(documentId);
  };

  const openExportDialog = (
    targetDocumentId = activeDocumentId,
    closeAfterSave = false,
  ) => {
    if (role !== "tutor") return;
    setExportDocumentId(targetDocumentId);
    setExportName("");
    setExportCloseAfterSave(closeAfterSave);
    setCloseDocumentId(null);
  };

  const confirmExport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const targetDocumentId = exportDocumentId;
    if (!targetDocumentId || exporting) return;

    setExporting(true);
    try {
      const exported = await exportAnnotatedPdf(targetDocumentId, exportName);
      if (exported && exportCloseAfterSave) removeDocument(targetDocumentId);
      if (exported) {
        setExportDocumentId(null);
        setExportName("");
        setExportCloseAfterSave(false);
      }
    } finally {
      setExporting(false);
    }
  };

  const pageEntries: RenderedPdfPage[] =
    documentKind === "pdf" && pdfPagePreviews.length > 0
      ? pdfPagePreviews
      : [{ page: 1, src: "", width: paperSize.width, height: paperSize.height }];
  const documentPendingClose = closeDocumentId
    ? openDocuments.find((document) => document.id === closeDocumentId) ?? null
    : null;
  const documentPendingExport = exportDocumentId
    ? openDocuments.find((document) => document.id === exportDocumentId) ?? null
    : null;
  const connectionDescription =
    connectionStatus === "connected"
      ? peerTransport === "browser"
        ? `${peerCount} peer${peerCount === 1 ? "" : "s"} connected in another browser tab.`
        : `${peerCount} peer${peerCount === 1 ? "" : "s"} connected directly over WebRTC.`
      : connectionStatus === "offline"
        ? "Peer pairing is unavailable; local drawing still works."
        : "Room is open. Waiting for a student to join.";
  const showDetails = role === "tutor" && detailsVisible;
  const documentTabs = openDocuments;
  const isUnjoinedStudent = role === "student" && sessionCode === "------";

  if (isUnjoinedStudent) {
    return (
      <main className="board-shell join-shell">
        <section className="join-gate" aria-label="Join tutoring session">
          <span className="eyebrow">STUDENT VIEW</span>
          <h1>Join your tutoring board</h1>
          <p>{notice || "Enter the session code from your tutor."}</p>
          <form className="join-form" onSubmit={joinSession}>
            <label htmlFor="join-code">Session code</label>
            <input
              id="join-code"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="ABC123"
              autoComplete="off"
              maxLength={8}
              autoFocus
            />
            <button className="toolbar-button toolbar-button--join" type="submit">Join session</button>
          </form>
        </section>
      </main>
    );
  }

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
            <button className="outline-button" type="button" onClick={regenerateSessionCode}>
              <Icon name="refresh" />
              Regenerate code
            </button>
          </div>

          <div className="sidebar-block">
            <div className="sidebar-label">
              <span>DOCUMENT</span>
              <span className="mono">{documentKind === "sample" ? "SAMPLE" : "READY"}</span>
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
                <strong>{documentName}</strong>
                <small>
                  {documentKind === "pdf"
                    ? `${pageCount} ${pageCount === 1 ? "page" : "pages"}`
                    : documentKind === "blank"
                      ? "Blank notes page"
                      : "Starter worksheet"}
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
            <div className="document-tabbar__tabs" role="tablist" aria-label="Open documents">
              {documentTabs.map((document) => (
                <div
                  key={document.id}
                  className={`document-tabbar__tab ${document.id === activeDocumentId ? "document-tabbar__tab--active" : ""}`}
                  title={document.name}
                >
                  <button
                    className="document-tabbar__tab-main"
                    type="button"
                    role="tab"
                    aria-selected={document.id === activeDocumentId}
                    disabled={role !== "tutor"}
                    onClick={() => activateDocument(document.id)}
                  >
                    <span className="document-tabbar__dot" aria-hidden="true" />
                    <span className="document-tabbar__name">{document.name}</span>
                    <span className="document-tabbar__role">
                      {document.kind === "blank" ? "NOTES" : document.kind === "pdf" ? "PDF" : "SAMPLE"}
                    </span>
                  </button>
                  {role === "tutor" ? (
                    <button
                      className="document-tabbar__tab-close"
                      type="button"
                      aria-label={`Close ${document.name}`}
                      onClick={() => requestCloseDocument(document.id)}
                    >
                      <Icon name="x" />
                    </button>
                  ) : null}
                </div>
              ))}
              {role === "tutor" ? (
                <>
                  <label className="document-tabbar__add" title="Open another PDF">
                    <Icon name="upload" />
                    <span>PDF</span>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={handleFileChange}
                    />
                  </label>
                  <button
                    className="document-tabbar__add"
                    type="button"
                    onClick={createBlankDocument}
                    title="Add a blank notes page"
                  >
                    <Icon name="plus" />
                    <span>Blank</span>
                  </button>
                </>
              ) : null}
            </div>
            <button
              className="document-tabbar__add document-tabbar__add--reference"
              type="button"
              aria-expanded={periodicTableOpen}
              aria-controls="aqa-periodic-table-viewer"
              onClick={() => setPeriodicTableOpen((open) => !open)}
              title={periodicTableOpen ? "Hide AQA periodic table" : "Show AQA periodic table"}
            >
              <Icon name="table" />
              <span>AQA table</span>
            </button>
          </div>
          <div className="workspace-toolbar" role="toolbar" aria-label="Document and annotation tools">
            <div className="toolbar-group toolbar-group--pages">
              {role === "tutor" ? (
                <button
                  className={`toolbar-button toolbar-button--details ${detailsVisible ? "toolbar-button--active" : ""}`}
                  type="button"
                  aria-pressed={detailsVisible}
                  onClick={() => setDetailsVisible((visible) => !visible)}
                  title={detailsVisible ? "Hide tutor details" : "Show tutor details"}
                >
                  <Icon name="sidebar" />
                  <span>{detailsVisible ? "Hide details" : "Show details"}</span>
                </button>
              ) : null}
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
            </div>

            <div className="tool-selector tool-selector--inline" role="group" aria-label="Annotation tools">
              <ToolButton compact active={visibleTool === "select"} label="Select" name="lasso" onClick={() => setActiveTool("select")} />
              <ToolButton compact active={visibleTool === "text"} label="Text" name="text" disabled={!canEdit} onClick={() => setActiveTool("text")} />
              <ToolButton compact active={visibleTool === "pen"} label="Pen" name="pen" disabled={!canEdit} onClick={() => setActiveTool("pen")} />
              <ToolButton compact active={visibleTool === "highlighter"} label="Highlight" name="highlighter" disabled={!canEdit} onClick={() => setActiveTool("highlighter")} />
              <ToolButton compact active={visibleTool === "eraser"} label="Erase" name="eraser" disabled={!canEdit} onClick={() => setActiveTool("eraser")} />
              <ToolButton compact active={visibleTool === "laser"} label="Laser" name="laser" disabled={!canEdit || role === "student"} onClick={() => setActiveTool("laser")} />
            </div>

            <div className="toolbar-context" aria-label="Tool options">
              {visibleTool === "pen" ? (
                <>
                  <div className="ink-options" aria-label="Pen thickness">
                    {[0.0025, 0.0045, 0.007].map((width) => (
                      <button
                        key={width}
                        className={`ink-width ${inkWidth === width ? "ink-width--active" : ""}`}
                        type="button"
                        aria-label={`Pen width ${width}`}
                        aria-pressed={inkWidth === width}
                        disabled={!canEdit}
                        onClick={() => setInkWidth(width)}
                      >
                        <span style={{ width: `${Math.max(5, width * 1000)}px`, height: `${Math.max(2, width * 600)}px` }} />
                      </button>
                    ))}
                  </div>
                  <label className="toolbar-range" title="Custom pen width">
                    <span>Size</span>
                    <input
                      className="toolbar-slider"
                      type="range"
                      min="0.0015"
                      max="0.016"
                      step="0.001"
                      value={inkWidth}
                      onChange={(event) => setInkWidth(Number(event.target.value))}
                      disabled={!canEdit}
                    />
                  </label>
                </>
              ) : null}
              {visibleTool === "highlighter" ? (
                <label className="toolbar-range" title="Highlighter width">
                  <span>Highlighter</span>
                  <input
                    className="toolbar-slider"
                    type="range"
                    min="0.008"
                    max="0.052"
                    step="0.002"
                    value={highlighterWidth}
                    onChange={(event) => setHighlighterWidth(Number(event.target.value))}
                    disabled={!canEdit}
                  />
                </label>
              ) : null}
              {visibleTool === "eraser" ? (
                <>
                  <div className="eraser-modes" role="group" aria-label="Eraser mode">
                    <button
                      className={eraserMode === "standard" ? "eraser-mode--active" : ""}
                      type="button"
                      aria-pressed={eraserMode === "standard"}
                      onClick={() => setEraserMode("standard")}
                    >
                      Circle
                    </button>
                    <button
                      className={eraserMode === "stroke" ? "eraser-mode--active" : ""}
                      type="button"
                      aria-pressed={eraserMode === "stroke"}
                      onClick={() => setEraserMode("stroke")}
                    >
                      Stroke
                    </button>
                  </div>
                  <label className="toolbar-range" title="Eraser size">
                    <span>Size</span>
                    <input
                      className="toolbar-slider"
                      type="range"
                      min="0.008"
                      max="0.065"
                      step="0.003"
                      value={eraserSize}
                      onChange={(event) => setEraserSize(Number(event.target.value))}
                      disabled={!canEdit}
                    />
                  </label>
                </>
              ) : null}
              {visibleTool === "laser" ? (
                <div className="laser-modes" role="group" aria-label="Laser pointer mode">
                  <button
                    className={laserMode === "line" ? "laser-mode--active" : ""}
                    type="button"
                    aria-pressed={laserMode === "line"}
                    onClick={() => setLaserMode("line")}
                  >
                    Line tracing
                  </button>
                  <button
                    className={laserMode === "dot" ? "laser-mode--active" : ""}
                    type="button"
                    aria-pressed={laserMode === "dot"}
                    onClick={() => setLaserMode("dot")}
                  >
                    Dot
                  </button>
                </div>
              ) : null}
              {visibleTool === "select" ? (
                <span className="toolbar-hint">
                  {selectedIds.length > 0 ? "Selected · drag to move" : "Tap ink or a photo to select"}
                </span>
              ) : null}
              {visibleTool === "text" ? (
                <label className="toolbar-range" title="Text font size">
                  <span>Text size</span>
                  <input
                    className="toolbar-slider"
                    type="range"
                    min="0.012"
                    max="0.06"
                    step="0.002"
                    value={textFontSize}
                    onChange={(event) => {
                      const nextFontSize = Number(event.target.value);
                      setTextFontSize(nextFontSize);
                      updateSelectedTextBoxes({ fontSize: nextFontSize });
                    }}
                    disabled={!canEdit}
                  />
                </label>
              ) : null}
              {visibleTool === "pen" || visibleTool === "highlighter" || visibleTool === "text" ? (
                <div className="ink-options" aria-label="Ink colour">
                  {["#111111", "#0e8a5c", "#386b8c", "#d34e4e", "#d69a2d", "#242826"].map((color) => (
                    <button
                      key={color}
                      className={`ink-color ${inkColor === color ? "ink-color--active" : ""}`}
                      type="button"
                      aria-label={`Use ${color} ink`}
                      aria-pressed={inkColor === color}
                      disabled={!canEdit}
                      onClick={() => {
                        setInkColor(color);
                        if (activeTool === "text") updateSelectedTextBoxes({ color });
                      }}
                      style={{ "--ink-color": color } as CSSProperties}
                    />
                  ))}
                </div>
              ) : null}
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
              <span className="toolbar-separator" aria-hidden="true" />
              <button className="icon-button" type="button" aria-label="Zoom out" title="Zoom out" disabled={role === "student" && studentViewMode === "follow"} onClick={() => setZoom((current) => Math.max(0.7, Number((current - 0.1).toFixed(2))))}>
                <Icon name="minus" />
              </button>
              <span className="zoom-label mono">{Math.round(zoom * 100)}%</span>
              <button className="icon-button" type="button" aria-label="Zoom in" title="Zoom in" disabled={role === "student" && studentViewMode === "follow"} onClick={() => setZoom((current) => Math.min(1.6, Number((current + 0.1).toFixed(2))))}>
                <Icon name="plus" />
              </button>
              {role === "tutor" ? (
                <>
                  <button className="toolbar-button toolbar-button--action" type="button" disabled={!canEdit} onClick={clearPage} title="Clear current page">
                    <Icon name="x" />
                    <span>Clear</span>
                  </button>
                  <button className="toolbar-button toolbar-button--action" type="button" disabled={documentKind === "sample"} onClick={() => openExportDialog()} title={documentKind === "sample" ? "The sample worksheet is not an exportable PDF" : "Export annotated PDF"}>
                    <Icon name="download" />
                    <span>Export PDF</span>
                  </button>
                </>
              ) : (
                <button className="toolbar-button toolbar-button--join" type="button" onClick={() => setJoinPromptVisible((visible) => !visible)}>
                  <span>Enter code</span>
                </button>
              )}
            </div>
          </div>

          <div
            className={`canvas-stage ${role === "student" && studentViewMode === "follow" ? "canvas-stage--follow" : ""}`}
            ref={stageRef}
            onScroll={handleStageScroll}
            onWheel={handleStageWheel}
            onKeyDown={handleStageKeyDown}
            onTouchStart={handleStageTouchStart}
            onTouchMove={handleStageTouchMove}
            onTouchEnd={handleStageTouchEnd}
            onTouchCancel={handleStageTouchEnd}
          >
            <canvas ref={canvasRef} className="pdf-render-cache" aria-hidden="true" />
            <div
              className="paper-stack"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
              {pageEntries.map((page) => {
                const pageAnnotations = annotations.filter(
                  (annotation) =>
                    annotation.documentId === activeDocumentId &&
                    annotation.page === page.page,
                );
                const pageImages = images.filter(
                  (image) =>
                    image.documentId === activeDocumentId && image.page === page.page,
                );
                const pageTextBoxes = textBoxes.filter(
                  (textBox) =>
                    textBox.documentId === activeDocumentId && textBox.page === page.page,
                );
                const pageLiveStrokes = liveStrokes.filter(
                  (stroke) =>
                    stroke.documentId === activeDocumentId && stroke.page === page.page,
                );
                const selectionBounds =
                  page.page === pageNumber ? getSelectionBounds(page.page) : null;

                return (
                  <article
                    key={`${activeDocumentId}-${page.page}`}
                    className={`paper-page ${page.page === pageNumber ? "paper-page--active" : ""}`}
                    data-page={page.page}
                    ref={(element) => {
                      if (element) pageElementsRef.current.set(page.page, element);
                      else pageElementsRef.current.delete(page.page);
                    }}
                    style={{ aspectRatio: `${page.width} / ${page.height}` }}
                  >
                    {documentKind === "pdf" && page.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="pdf-page-image" src={page.src} alt={`PDF page ${page.page}`} draggable={false} />
                    ) : null}
                    {documentKind === "sample" && page.page === 1 ? (
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
                    {documentKind === "blank" ? (
                      <div className="blank-page" aria-label="Blank notes page" />
                    ) : null}

                    {pageTextBoxes.map((textBox) => (
                      <div
                        key={textBox.id}
                        className={`page-text ${selectedIds.includes(textBox.id) ? "page-text--selected" : ""} ${activeTool === "text" || editingTextId === textBox.id ? "page-text--interactive" : ""}`}
                        style={{
                          color: textBox.color,
                          left: `${textBox.x * 100}%`,
                          top: `${textBox.y * 100}%`,
                          width: `${textBox.width * 100}%`,
                          height: `${textBox.height * 100}%`,
                          fontSize: `${textBox.fontSize * 100}cqw`,
                          pointerEvents:
                            activeTool === "text" || editingTextId === textBox.id
                              ? "auto"
                              : "none",
                        }}
                        onPointerDown={(event) => {
                          if (activeTool === "text") {
                            event.stopPropagation();
                            setSelectedIds([textBox.id]);
                            setEditingTextId(textBox.id);
                          }
                        }}
                      >
                        {editingTextId === textBox.id ? (
                          <textarea
                            value={textBox.text}
                            onChange={(event) => updateTextBox(textBox.id, event.target.value)}
                            onBlur={() => finishTextEditing(textBox.id)}
                            placeholder="Type here…"
                            aria-label="Text annotation"
                            autoFocus
                          />
                        ) : (
                          textBox.text
                        )}
                      </div>
                    ))}

                    {pageImages.map((image) => (
                      // These images are local clipboard data URLs; next/image cannot optimize them.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={image.id}
                        className={`page-image ${selectedIds.includes(image.id) ? "page-image--selected" : ""}`}
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
                    ))}

                    <svg
                      className={`annotation-layer ${visibleTool === "select" ? "annotation-layer--select" : ""} ${!canEdit ? "annotation-layer--readonly" : ""}`}
                      data-page={String(page.page)}
                      style={{ pointerEvents: canEdit ? "auto" : "none" }}
                      viewBox="0 0 1 1"
                      preserveAspectRatio="none"
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      onPointerLeave={handlePointerLeave}
                      aria-label={`Annotation layer for page ${page.page}`}
                    >
                      {pageAnnotations.map((annotation) => (
                        <g key={annotation.id}>
                          {selectedIds.includes(annotation.id)
                            ? getAnnotationSegments(annotation).map((segment, index) => (
                                <polyline
                                  key={`${annotation.id}-selection-${index}`}
                                  points={segment.map((point) => `${point.x},${point.y}`).join(" ")}
                                  fill="none"
                                  stroke="var(--accent)"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={annotation.width + 0.014}
                                  opacity={0.32}
                                />
                              ))
                            : null}
                          {getAnnotationSegments(annotation).map((segment, index) => (
                            <polyline
                              key={`${annotation.id}-${index}`}
                              points={segment.map((point) => `${point.x},${point.y}`).join(" ")}
                              fill="none"
                              stroke={annotation.color}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={annotation.width}
                              opacity={annotation.opacity}
                            />
                          ))}
                        </g>
                      ))}
                      {pageLiveStrokes
                        .filter((stroke) => stroke.id !== activeStrokeId && stroke.kind !== "laser")
                        .map((stroke) => (
                          <polyline
                            key={`live-${stroke.id}`}
                            points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
                            fill="none"
                            stroke={stroke.color}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={stroke.width}
                            opacity={stroke.opacity}
                          />
                        ))}
                      {pageLiveStrokes
                        .filter((stroke) => stroke.id !== activeStrokeId && stroke.kind === "laser")
                        .map((stroke) => {
                          const lastPoint = stroke.points.at(-1);
                          if (!lastPoint) return null;
                          return stroke.laserMode === "dot" ? (
                            <ellipse
                              key={`laser-dot-${stroke.id}`}
                              className={`laser-dot ${stroke.laserFadeUntil ? "laser-dot--fading" : ""}`}
                              cx={lastPoint.x}
                              cy={lastPoint.y}
                              rx={0.011 * (page.height / page.width)}
                              ry="0.011"
                            />
                          ) : (
                            <polyline
                              key={`laser-line-${stroke.id}`}
                              className={`laser-line ${stroke.laserFadeUntil ? "laser-line--fading" : ""}`}
                              points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
                            />
                          );
                        })}
                      {activeStroke && page.page === activeStrokePage ? (
                        <polyline
                          points={activeStroke.map((point) => `${point.x},${point.y}`).join(" ")}
                          fill="none"
                          stroke={inkColor}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={activeTool === "highlighter" ? highlighterWidth : inkWidth}
                          opacity={activeTool === "highlighter" ? 0.28 : 0.92}
                        />
                      ) : null}
                      {activeLaser && page.page === activeLaser.page ? (
                        activeLaser.mode === "dot" ? (
                          <ellipse
                            className="laser-dot laser-dot--active"
                            cx={activeLaser.points.at(-1)?.x}
                            cy={activeLaser.points.at(-1)?.y}
                            rx={0.011 * (page.height / page.width)}
                            ry="0.011"
                          />
                        ) : (
                          <polyline
                            className="laser-line laser-line--active"
                            points={activeLaser.points.map((point) => `${point.x},${point.y}`).join(" ")}
                          />
                        )
                      ) : null}
                      {visibleTool === "eraser" && eraserCursor?.page === page.page ? (
                        <ellipse
                          className="eraser-cursor"
                          cx={eraserCursor.point.x}
                          cy={eraserCursor.point.y}
                          rx={eraserSize * (page.height / page.width)}
                          ry={eraserSize}
                        />
                      ) : null}
                      {lassoPoints.length >= 2 && page.page === pageNumber ? (
                        <polygon
                          className="lasso-preview"
                          points={lassoPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                        />
                      ) : null}
                      {selectionBounds && canEdit && visibleTool === "select" && selectedIds.length > 0 ? (
                        <g className="selection-overlay">
                          <rect
                            className="selection-bounds"
                            x={selectionBounds.x}
                            y={selectionBounds.y}
                            width={selectionBounds.width}
                            height={selectionBounds.height}
                          />
                          <g
                            className="resize-handle"
                            data-page={String(page.page)}
                            onPointerDown={(event) => handleResizeStart(event, page.page)}
                            aria-label="Resize selection"
                            role="button"
                          >
                            <rect
                              className="resize-handle__hit"
                              x={selectionBounds.x + selectionBounds.width - 0.024}
                              y={selectionBounds.y + selectionBounds.height - 0.024}
                              width="0.028"
                              height="0.028"
                              rx="0.004"
                            />
                            <path
                              className="resize-handle__icon"
                              d={`M ${selectionBounds.x + selectionBounds.width - 0.014} ${selectionBounds.y + selectionBounds.height - 0.005} L ${selectionBounds.x + selectionBounds.width - 0.005} ${selectionBounds.y + selectionBounds.height - 0.005} L ${selectionBounds.x + selectionBounds.width - 0.005} ${selectionBounds.y + selectionBounds.height - 0.014} M ${selectionBounds.x + selectionBounds.width - 0.008} ${selectionBounds.y + selectionBounds.height - 0.008} L ${selectionBounds.x + selectionBounds.width - 0.005} ${selectionBounds.y + selectionBounds.height - 0.005}`}
                            />
                          </g>
                        </g>
                      ) : null}
                    </svg>
                    {selectionBounds && selectedIds.length > 0 && canEdit && visibleTool === "select" ? (
                      <div className="selection-menu">
                        <span>Selected</span>
                        <button type="button" onClick={deleteSelection}>Delete</button>
                        <button type="button" onClick={() => setSelectedIds([])}>Done</button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>

          {periodicTableOpen ? (
            <div className="reference-viewer-backdrop" role="presentation">
              <section
                className="reference-viewer"
                id="aqa-periodic-table-viewer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="aqa-periodic-table-title"
              >
                <header className="reference-viewer__header">
                  <div>
                    <span className="eyebrow">AQA A-LEVEL CHEMISTRY</span>
                    <h2 id="aqa-periodic-table-title">Periodic table &amp; data booklet</h2>
                  </div>
                  <div className="reference-viewer__actions">
                    <a
                      className="toolbar-button"
                      href="https://mmerevise.co.uk/app/uploads/2022/10/AQA-A-Level-Chemistry-Insert.pdf"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open PDF
                    </a>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Close AQA periodic table"
                      onClick={() => setPeriodicTableOpen(false)}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                </header>
                <iframe
                  title="AQA A-level Chemistry insert, periodic table on page 2"
                  src="https://mmerevise.co.uk/app/uploads/2022/10/AQA-A-Level-Chemistry-Insert.pdf#page=2"
                />
              </section>
            </div>
          ) : null}

          {joinPromptVisible && role === "student" ? (
            <form className="join-form join-form--toolbar" onSubmit={joinSession}>
              <label htmlFor="toolbar-join-code">Session code</label>
              <input
                id="toolbar-join-code"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="ABC123"
                autoComplete="off"
                maxLength={8}
              />
              <button className="toolbar-button toolbar-button--join" type="submit">Join</button>
              <button className="icon-button" type="button" aria-label="Cancel joining" onClick={() => setJoinPromptVisible(false)}>
                <Icon name="x" />
              </button>
            </form>
          ) : null}
          {documentPendingExport ? (
            <div className="modal-backdrop" role="presentation">
              <form
                className="confirm-dialog export-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="export-document-title"
                onSubmit={(event) => void confirmExport(event)}
              >
                <span className="eyebrow">EXPORT DOCUMENT</span>
                <h2 id="export-document-title">Export {documentPendingExport.name}</h2>
                <p>
                  Export the original PDF with all saved ink, images, and text placed on top.
                </p>
                <label className="export-dialog__label" htmlFor="export-file-name">
                  File name <span>(optional)</span>
                </label>
                <input
                  id="export-file-name"
                  className="export-dialog__input"
                  value={exportName}
                  onChange={(event) => setExportName(event.target.value)}
                  placeholder={getExportFileName("", documentPendingExport.name)}
                  autoFocus
                  autoComplete="off"
                />
                <p className="confirm-dialog__hint">
                  Leave blank to use {getExportFileName("", documentPendingExport.name)}.
                </p>
                <div className="confirm-dialog__actions">
                  <button
                    className="toolbar-button"
                    type="button"
                    disabled={exporting}
                    onClick={() => {
                      setExportDocumentId(null);
                      setExportName("");
                      setExportCloseAfterSave(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button className="toolbar-button toolbar-button--join" type="submit" disabled={exporting || pdfLoading}>
                    <Icon name="download" />
                    {exporting
                      ? "Exporting…"
                      : exportCloseAfterSave
                        ? "Export & close"
                        : "Export PDF"}
                  </button>
                </div>
              </form>
            </div>
          ) : null}
          {documentPendingClose ? (
            <div className="modal-backdrop" role="presentation">
              <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="close-document-title">
                <span className="eyebrow">CLOSE DOCUMENT</span>
                <h2 id="close-document-title">Close {documentPendingClose.name}?</h2>
                <p>
                  This removes the document and all of its annotations from this board. Once closed, it cannot be reopened here.
                </p>
                <p className="confirm-dialog__hint">
                  {documentPendingClose.kind === "sample"
                    ? "This starter sheet is sample content; removing it does not affect your other documents."
                    : "Export an annotated PDF first if you want to keep a copy."}
                </p>
                <div className="confirm-dialog__actions">
                  <button className="toolbar-button" type="button" onClick={() => setCloseDocumentId(null)}>
                    Keep open
                  </button>
                  {documentPendingClose.kind !== "sample" ? (
                    <button className="toolbar-button toolbar-button--join" type="button" disabled={pdfLoading} onClick={() => openExportDialog(documentPendingClose.id, true)}>
                      <Icon name="download" />
                      Export &amp; close
                    </button>
                  ) : null}
                  <button className="toolbar-button toolbar-button--delete" type="button" onClick={() => removeDocument(documentPendingClose.id)}>
                    {documentPendingClose.kind === "sample" ? "Remove sample" : "Close without export"}
                  </button>
                </div>
              </section>
            </div>
          ) : null}
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
