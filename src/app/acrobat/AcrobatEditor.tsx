"use client";

/* PDF and data-URL images are intentionally rendered as native images. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from "react";

type Tool =
  | "select"
  | "text"
  | "image"
  | "comment"
  | "highlight"
  | "draw"
  | "erase";

type PageKind = "sample" | "blank" | "pdf";

type RenderedPage = {
  page: number;
  kind: PageKind;
  src: string;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
};

type Point = { x: number; y: number };

type AnnotationKind = "text" | "image" | "comment" | "highlight" | "draw";

type Annotation = {
  id: string;
  page: number;
  kind: AnnotationKind;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  src?: string;
  points?: Point[];
  color: string;
  opacity: number;
  fontSize?: number;
  createdAt: number;
};

type SelectionBox = {
  x: number;
  y: number;
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
  }) => { promise: Promise<void> };
  getTextContent?: () => Promise<{
    items: Array<{ str?: string }>;
  }>;
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

type PdfTextMap = Record<number, string>;

type DragState = {
  id: string;
  page: number;
  start: Point;
  origin: { x: number; y: number };
};

type ExportPage = {
  bytes: Uint8Array;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
};

const SAMPLE_TEXT =
  "AeroPDF is a private PDF workspace for editing, reviewing, and sharing documents. Add a note, highlight a passage, or place an image directly on the page.";
const SAMPLE_PAGE: RenderedPage = {
  page: 1,
  kind: "sample",
  src: "",
  width: 612,
  height: 792,
  pixelWidth: 1224,
  pixelHeight: 1584,
};

const INK_COLORS = ["#1f2937", "#0e8a5c", "#2f6f9f", "#bc3e48", "#a66a12"];

function idFor(kind: string) {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function dataUrlToBytes(value: string) {
  const binary = atob(value.split(",")[1] ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function buildRasterPdf(pages: ExportPage[]) {
  const encoder = new TextEncoder();
  const objects: Uint8Array[] = [];
  const pageIds: number[] = [];
  const setObject = (id: number, value: Uint8Array) => {
    objects[id] = value;
  };

  setObject(1, encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"));
  pages.forEach((page, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    pageIds.push(pageId);
    setObject(
      pageId,
      encoder.encode(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
    setObject(
      imageId,
      new Uint8Array([
        ...encoder.encode(
          `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
        ),
        ...page.bytes,
        ...encoder.encode("\nendstream"),
      ]),
    );
    const content = encoder.encode(
      `q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q`,
    );
    setObject(
      contentId,
      new Uint8Array([
        ...encoder.encode(`<< /Length ${content.length} >>\nstream\n`),
        ...content,
        ...encoder.encode("\nendstream"),
      ]),
    );
  });

  setObject(
    2,
    encoder.encode(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,
    ),
  );

  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n%AeroPDF local export\n")];
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
  chunks.push(
    encoder.encode(
      [
        `xref\n0 ${objects.length}`,
        "0000000000 65535 f ",
        ...offsets.slice(1).map(
          (entry) => `${String(entry).padStart(10, "0")} 00000 n `,
        ),
        `trailer\n<< /Size ${objects.length} /Root 1 0 R >>`,
        `startxref\n${xrefOffset}`,
        "%%EOF",
      ].join("\n"),
    ),
  );

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let cursor = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, cursor);
    cursor += chunk.length;
  });
  return output;
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
  };

  const paths: Record<string, React.ReactNode> = {
    grid: <><rect {...common} x="3" y="3" width="6" height="6" rx="1" /><rect {...common} x="15" y="3" width="6" height="6" rx="1" /><rect {...common} x="3" y="15" width="6" height="6" rx="1" /><rect {...common} x="15" y="15" width="6" height="6" rx="1" /></>,
    pages: <><rect {...common} x="5" y="3" width="14" height="18" rx="1.5" /><path {...common} d="M8 7h8M8 11h8M8 15h5" /></>,
    comment: <><path {...common} d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5h-6l-4.4 3v-3H6.5A2.5 2.5 0 0 1 4 12.5z" /><path {...common} d="M8 8h8M8 11h5" /></>,
    text: <><path {...common} d="M5 5h14M12 5v14M8 19h8" /></>,
    image: <><rect {...common} x="3" y="4" width="18" height="16" rx="2" /><circle {...common} cx="8" cy="9" r="1.5" /><path {...common} d="m4 17 4.6-4.5 3.2 3 2.6-2.4L20 18" /></>,
    highlighter: <><path {...common} d="m5 15 8.8-8.8a2.1 2.1 0 0 1 3 0l1.9 1.9a2.1 2.1 0 0 1 0 3L10 19.8 5 20z" /><path {...common} d="m13 7 4 4M5 15l4 4M3 21h18" /></>,
    pen: <><path {...common} d="m4 16 10.8-10.8a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L8 20l-5 1z" /><path {...common} d="m13 7 4 4" /></>,
    cursor: <path {...common} d="m5 3 5.1 17 2.8-7.1L20 10z" />,
    search: <><circle {...common} cx="10.5" cy="10.5" r="6.5" /><path {...common} d="m16 16 5 5" /></>,
    undo: <><path {...common} d="M9 7 4 12l5 5" /><path {...common} d="M4 12h10a6 6 0 0 1 6 6" /></>,
    redo: <><path {...common} d="m15 7 5 5-5 5" /><path {...common} d="M20 12H10a6 6 0 0 0-6 6" /></>,
    plus: <><path {...common} d="M12 5v14M5 12h14" /></>,
    minus: <path {...common} d="M5 12h14" />,
    download: <><path {...common} d="M12 3v12M7 10l5 5 5-5M4 20h16" /></>,
    upload: <><path {...common} d="M12 16V4M7 9l5-5 5 5M4 20h16" /></>,
    rotate: <><path {...common} d="M5 8a8 8 0 1 1-1 6" /><path {...common} d="M5 3v5h5" /></>,
    trash: <><path {...common} d="M4 7h16M10 11v5M14 11v5M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
    close: <><path {...common} d="m6 6 12 12M18 6 6 18" /></>,
    chevron: <path {...common} d="m9 5 7 7-7 7" />,
    lock: <><rect {...common} x="5" y="10" width="14" height="10" rx="2" /><path {...common} d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    eye: <><path {...common} d="M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6z" /><circle {...common} cx="12" cy="12" r="2.5" /></>,
    more: <><circle fill="currentColor" cx="5" cy="12" r="1.4" /><circle fill="currentColor" cx="12" cy="12" r="1.4" /><circle fill="currentColor" cx="19" cy="12" r="1.4" /></>,
    fit: <><path {...common} d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>,
    check: <path {...common} d="m5 12 4 4L19 6" />,
  };

  return (
    <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size}>
      {paths[name] ?? paths.grid}
    </svg>
  );
}

function ToolButton({
  active,
  disabled,
  label,
  name,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`acro-tool ${active ? "acro-tool--active" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon name={name} size={17} />
      <span>{label}</span>
    </button>
  );
}

function samplePageMarkup() {
  return (
    <div className="acro-sample-page" aria-label="Sample AeroPDF document">
      <div className="acro-sample-topline">
        <span>AEROPDF / WORKSPACE GUIDE</span>
        <span>01</span>
      </div>
      <div className="acro-sample-rule" />
      <span className="acro-sample-kicker">A private document workspace</span>
      <h2>Make every page<br /><em>work harder.</em></h2>
      <p>{SAMPLE_TEXT}</p>
      <div className="acro-sample-columns">
        <div><span>01</span><strong>EDIT</strong><small>Add text, images, and marks without leaving the page.</small></div>
        <div><span>02</span><strong>REVIEW</strong><small>Keep comments together and resolve them when ready.</small></div>
      </div>
      <div className="acro-sample-footer">
        <span>LOCAL-FIRST / NO ACCOUNT</span>
        <span>FREE EDITION</span>
      </div>
    </div>
  );
}

function boundsForAnnotation(annotation: Annotation): SelectionBox {
  if (annotation.kind !== "draw" || !annotation.points?.length) {
    return {
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
    };
  }
  const xs = annotation.points.map((point) => point.x);
  const ys = annotation.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(0.03, Math.max(...xs) - minX),
    height: Math.max(0.03, Math.max(...ys) - minY),
  };
}

function annotationStyle(annotation: Annotation): CSSProperties {
  return {
    left: `${annotation.x * 100}%`,
    top: `${annotation.y * 100}%`,
    width: `${annotation.width * 100}%`,
    height: `${annotation.height * 100}%`,
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawSampleForExport(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#fbfaf7";
  context.fillRect(0, 0, width, height);
  const scale = width / 612;
  context.fillStyle = "#19201d";
  context.font = `${8 * scale}px Arial`;
  context.fillText("AEROPDF / WORKSPACE GUIDE", 44 * scale, 44 * scale);
  context.fillText("01", 550 * scale, 44 * scale);
  context.strokeStyle = "#d9d8d3";
  context.lineWidth = Math.max(1, scale);
  context.beginPath();
  context.moveTo(44 * scale, 58 * scale);
  context.lineTo(568 * scale, 58 * scale);
  context.stroke();
  context.fillStyle = "#0e8a5c";
  context.font = `${10 * scale}px Arial`;
  context.fillText("A PRIVATE DOCUMENT WORKSPACE", 44 * scale, 102 * scale);
  context.fillStyle = "#19201d";
  context.font = `bold ${34 * scale}px Georgia`;
  context.fillText("Make every page", 44 * scale, 153 * scale);
  context.fillStyle = "#0e8a5c";
  context.font = `italic ${34 * scale}px Georgia`;
  context.fillText("work harder.", 44 * scale, 193 * scale);
  context.fillStyle = "#60635f";
  context.font = `${12 * scale}px Arial`;
  const lines = [
    "AeroPDF is a private PDF workspace for editing, reviewing,",
    "and sharing documents. Add a note, highlight a passage,",
    "or place an image directly on the page.",
  ];
  lines.forEach((line, index) => context.fillText(line, 44 * scale, (242 + index * 18) * scale));
  context.strokeStyle = "#d9d8d3";
  context.beginPath();
  context.moveTo(44 * scale, 338 * scale);
  context.lineTo(568 * scale, 338 * scale);
  context.stroke();
  context.fillStyle = "#19201d";
  context.font = `bold ${11 * scale}px Arial`;
  context.fillText("01  EDIT", 44 * scale, 376 * scale);
  context.fillText("02  REVIEW", 306 * scale, 376 * scale);
  context.fillStyle = "#60635f";
  context.font = `${10 * scale}px Arial`;
  context.fillText("Add text, images, and marks without leaving the page.", 44 * scale, 400 * scale);
  context.fillText("Keep comments together and resolve them when ready.", 306 * scale, 400 * scale);
  context.fillStyle = "#858983";
  context.font = `${8 * scale}px Arial`;
  context.fillText("LOCAL-FIRST / NO ACCOUNT", 44 * scale, 742 * scale);
  context.fillText("FREE EDITION", 500 * scale, 742 * scale);
}

export default function AcrobatEditor() {
  const [pages, setPages] = useState<RenderedPage[]>([SAMPLE_PAGE]);
  const [documentName, setDocumentName] = useState("Workspace guide.pdf");
  const [documentKind, setDocumentKind] = useState<PageKind>("sample");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activePage, setActivePage] = useState(1);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [pagesOpen, setPagesOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageText, setPageText] = useState<PdfTextMap>({ 1: SAMPLE_TEXT });
  const [inkColor, setInkColor] = useState(INK_COLORS[1]);
  const fontSize = 0.026;
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("Ready. Your files stay on this device.");
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [future, setFuture] = useState<Annotation[][]>([]);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [draftPage, setDraftPage] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pageRefs = useRef(new Map<number, HTMLElement>());
  const dragRef = useRef<DragState | null>(null);
  const drawRef = useRef<{ page: number; points: Point[] } | null>(null);

  const comments = useMemo(
    () => annotations.filter((annotation) => annotation.kind === "comment"),
    [annotations],
  );
  const selectedAnnotation = annotations.find((annotation) => annotation.id === selectedId);
  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return pages.filter((page) => (pageText[page.page] ?? "").toLowerCase().includes(query));
  }, [pageText, pages, searchQuery]);

  const checkpoint = useCallback(() => {
    setHistory((current) => [...current.slice(-24), annotations]);
    setFuture([]);
  }, [annotations]);

  const openPdf = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setNotice("Please choose a PDF file.");
      return;
    }
    setLoading(true);
    setNotice(`Opening ${file.name}…`);
    try {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url,
      ).toString();
      const data = await file.arrayBuffer();
      const document = await pdfjs.getDocument({ data }).promise as PdfDocument;
      const rendered: RenderedPage[] = [];
      const text: PdfTextMap = {};
      const renderScale = 1.5;

      for (let number = 1; number <= document.numPages; number += 1) {
        const page = await document.getPage(number);
        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) continue;
        await page.render({ canvasContext: context, viewport }).promise;
        rendered.push({
          page: number,
          kind: "pdf",
          src: canvas.toDataURL("image/jpeg", 0.94),
          width: baseViewport.width,
          height: baseViewport.height,
          pixelWidth: canvas.width,
          pixelHeight: canvas.height,
        });
        if (page.getTextContent) {
          const content = await page.getTextContent();
          text[number] = content.items.map((item) => item.str ?? "").join(" ");
        }
      }

      if (!rendered.length) throw new Error("No pages rendered");
      setPages(rendered);
      setPageText(text);
      setDocumentName(file.name);
      setDocumentKind("pdf");
      setAnnotations([]);
      setHistory([]);
      setFuture([]);
      setSelectedId(null);
      setEditingTextId(null);
      setActivePage(1);
      setZoom(1);
      setNotice(`${file.name} is open. ${rendered.length} ${rendered.length === 1 ? "page" : "pages"}.`);
    } catch {
      setNotice("That PDF could not be opened. Try a different file.");
    } finally {
      setLoading(false);
    }
  };

  const handlePdfChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void openPdf(file);
    event.target.value = "";
  };

  const makeBlankDocument = () => {
    setPages([{ ...SAMPLE_PAGE, kind: "blank", src: "" }]);
    setPageText({});
    setDocumentName("Untitled document.pdf");
    setDocumentKind("blank");
    setAnnotations([]);
    setHistory([]);
    setFuture([]);
    setSelectedId(null);
    setActivePage(1);
    setNotice("Blank document ready.");
  };

  const addPage = () => {
    const nextPage = pages.length + 1;
    setPages((current) => [...current, { ...SAMPLE_PAGE, page: nextPage, kind: "blank", src: "" }]);
    setActivePage(nextPage);
    setNotice(`Blank page ${nextPage} added.`);
  };

  const deletePage = () => {
    if (pages.length === 1) {
      setNotice("A document needs at least one page.");
      return;
    }
    checkpoint();
    const deleted = activePage;
    const nextPages = pages
      .filter((page) => page.page !== deleted)
      .map((page, index) => ({ ...page, page: index + 1 }));
    setPages(nextPages);
    setAnnotations((current) =>
      current
        .filter((annotation) => annotation.page !== deleted)
        .map((annotation) => ({
          ...annotation,
          page: annotation.page > deleted ? annotation.page - 1 : annotation.page,
        })),
    );
    setActivePage(Math.min(deleted, nextPages.length));
    setSelectedId(null);
    setNotice(`Page ${deleted} deleted.`);
  };

  const pagePoint = (
    event: Pick<ReactPointerEvent<Element>, "clientX" | "clientY">,
    element: Element,
  ): Point => {
    const bounds = element.getBoundingClientRect();
    return {
      x: clampUnit((event.clientX - bounds.left) / bounds.width),
      y: clampUnit((event.clientY - bounds.top) / bounds.height),
    };
  };

  const addTextAt = (point: Point) => {
    checkpoint();
    const annotation: Annotation = {
      id: idFor("text"),
      page: activePage,
      kind: "text",
      x: Math.min(0.7, point.x),
      y: Math.min(0.88, point.y),
      width: 0.28,
      height: 0.08,
      text: "Type here",
      color: inkColor,
      opacity: 1,
      fontSize,
      createdAt: 0,
    };
    setAnnotations((current) => [...current, annotation]);
    setSelectedId(annotation.id);
    setEditingTextId(annotation.id);
    setActiveTool("select");
  };

  const addCommentAt = (point: Point) => {
    checkpoint();
    const annotation: Annotation = {
      id: idFor("comment"),
      page: activePage,
      kind: "comment",
      x: Math.min(0.92, point.x),
      y: Math.min(0.92, point.y),
      width: 0.045,
      height: 0.045,
      text: "New comment",
      color: "#f0b644",
      opacity: 1,
      createdAt: 0,
    };
    setAnnotations((current) => [...current, annotation]);
    setSelectedId(annotation.id);
    setCommentsOpen(true);
    setActiveTool("select");
    setNotice("Comment added. Write it in the Comments panel.");
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      setNotice("Choose a PNG, JPG, GIF, or other image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!src) return;
      checkpoint();
      const annotation: Annotation = {
        id: idFor("image"),
        page: activePage,
        kind: "image",
        x: 0.31,
        y: 0.28,
        width: 0.38,
        height: 0.25,
        src,
        color: inkColor,
        opacity: 1,
        createdAt: 0,
      };
      setAnnotations((current) => [...current, annotation]);
      setSelectedId(annotation.id);
      setActiveTool("select");
      setNotice(`${file.name} placed on page ${activePage}.`);
    };
    reader.readAsDataURL(file);
  };

  const selectAnnotation = (annotation: Annotation) => {
    setSelectedId(annotation.id);
    if (annotation.kind === "comment") setCommentsOpen(true);
  };

  const deleteAnnotation = useCallback((id: string) => {
    checkpoint();
    setAnnotations((current) => current.filter((annotation) => annotation.id !== id));
    setSelectedId((current) => (current === id ? null : current));
    setEditingTextId((current) => (current === id ? null : current));
    setNotice("Selection deleted.");
  }, [checkpoint]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    deleteAnnotation(selectedId);
  }, [deleteAnnotation, selectedId]);

  const updateAnnotation = (id: string, patch: Partial<Annotation>) => {
    setAnnotations((current) => current.map((annotation) =>
      annotation.id === id ? { ...annotation, ...patch } : annotation,
    ));
  };

  const beginDrag = (
    event: Pick<ReactPointerEvent<Element>, "clientX" | "clientY" | "stopPropagation">,
    annotation: Annotation,
  ) => {
    if (activeTool !== "select") return;
    event.stopPropagation();
    const pageElement = pageRefs.current.get(annotation.page);
    if (!pageElement) return;
    const point = pagePoint(event, pageElement);
    dragRef.current = {
      id: annotation.id,
      page: annotation.page,
      start: point,
      origin: { x: annotation.x, y: annotation.y },
    };
    selectAnnotation(annotation);
  };

  const handlePagePointerDown = (event: ReactPointerEvent<HTMLDivElement>, page: number) => {
    const pageElement = event.currentTarget;
    setActivePage(page);
    const point = pagePoint(event, pageElement);

    if (activeTool === "text") {
      addTextAt(point);
      return;
    }
    if (activeTool === "comment") {
      addCommentAt(point);
      return;
    }
    if (activeTool === "erase") {
      const hit = [...annotations].reverse().find((annotation) => {
        const bounds = boundsForAnnotation(annotation);
        return annotation.page === page && point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
      });
      if (hit) {
        deleteAnnotation(hit.id);
        setNotice("Annotation erased.");
      }
      return;
    }
    if (activeTool === "highlight" || activeTool === "draw") {
      drawRef.current = { page, points: [point] };
      setDraftPage(page);
      setDraftPoints([point]);
      pageElement.setPointerCapture(event.pointerId);
      return;
    }
    if (activeTool === "select") {
      setSelectedId(null);
    }
  };

  const handlePagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pageElement = event.currentTarget;
    const point = pagePoint(event, pageElement);
    const drag = dragRef.current;
    if (drag) {
      const delta = { x: point.x - drag.start.x, y: point.y - drag.start.y };
      updateAnnotation(drag.id, {
        x: clampUnit(drag.origin.x + delta.x),
        y: clampUnit(drag.origin.y + delta.y),
      });
      return;
    }
    const draw = drawRef.current;
    if (draw && draw.page === Number(pageElement.dataset.page)) {
      const next = [...draw.points, point];
      draw.points = next;
      setDraftPoints(next);
    }
  };

  const handlePagePointerUp = () => {
    dragRef.current = null;
    const draw = drawRef.current;
    if (!draw || draw.points.length < 2) {
      drawRef.current = null;
      setDraftPage(null);
      setDraftPoints([]);
      return;
    }
    checkpoint();
    const xs = draw.points.map((point) => point.x);
    const ys = draw.points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const kind = activeTool === "highlight" ? "highlight" : "draw";
    const annotation: Annotation = {
      id: idFor(kind),
      page: draw.page,
      kind,
      x: minX,
      y: minY,
      width: Math.max(0.02, Math.max(...xs) - minX),
      height: Math.max(0.02, Math.max(...ys) - minY),
      points: draw.points,
      color: kind === "highlight" ? "#f3cf4f" : inkColor,
      opacity: kind === "highlight" ? 0.38 : 0.9,
      createdAt: 0,
    };
    setAnnotations((current) => [...current, annotation]);
    setSelectedId(annotation.id);
    drawRef.current = null;
    setDraftPage(null);
    setDraftPoints([]);
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((current) => [...current, annotations]);
    setAnnotations(previous);
    setHistory((current) => current.slice(0, -1));
    setSelectedId(null);
    setNotice("Undid last change.");
  };

  const redo = () => {
    const next = future.at(-1);
    if (!next) return;
    setHistory((current) => [...current, annotations]);
    setAnnotations(next);
    setFuture((current) => current.slice(0, -1));
    setSelectedId(null);
    setNotice("Redid change.");
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "TEXTAREA" || target?.tagName === "INPUT";
      if ((event.key === "Backspace" || event.key === "Delete") && !typing && selectedId) {
        event.preventDefault();
        deleteSelected();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const exportPdf = async () => {
    setExporting(true);
    setNotice("Preparing a local PDF export…");
    try {
      const exportPages: ExportPage[] = [];
      for (const page of pages) {
        const canvas = window.document.createElement("canvas");
        canvas.width = page.pixelWidth;
        canvas.height = page.pixelHeight;
        const context = canvas.getContext("2d");
        if (!context) continue;
        if (page.src) {
          const image = await loadImage(page.src);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
        } else {
          drawSampleForExport(context, canvas.width, canvas.height);
        }
        const pageAnnotations = annotations.filter((annotation) => annotation.page === page.page);
        for (const annotation of pageAnnotations) {
          const px = page.pixelWidth;
          const py = page.pixelHeight;
          if (annotation.kind === "highlight") {
            context.fillStyle = `rgba(243, 207, 79, ${annotation.opacity})`;
            context.fillRect(annotation.x * px, annotation.y * py, annotation.width * px, Math.max(12, annotation.height * py));
          } else if (annotation.kind === "draw" && annotation.points?.length) {
            context.strokeStyle = annotation.color;
            context.globalAlpha = annotation.opacity;
            context.lineWidth = Math.max(3, px * 0.004);
            context.lineCap = "round";
            context.lineJoin = "round";
            context.beginPath();
            annotation.points.forEach((point, index) => {
              if (index === 0) context.moveTo(point.x * px, point.y * py);
              else context.lineTo(point.x * px, point.y * py);
            });
            context.stroke();
            context.globalAlpha = 1;
          } else if (annotation.kind === "text") {
            context.fillStyle = annotation.color;
            context.font = `${Math.max(14, (annotation.fontSize ?? 0.026) * py)}px Arial`;
            const lines = (annotation.text ?? "").split("\n");
            lines.forEach((line, index) => context.fillText(line, annotation.x * px, (annotation.y + 0.03 + index * (annotation.fontSize ?? 0.026) * 1.25) * py));
          } else if (annotation.kind === "image" && annotation.src) {
            try {
              const image = await loadImage(annotation.src);
              context.drawImage(image, annotation.x * px, annotation.y * py, annotation.width * px, annotation.height * py);
            } catch {
              // A broken local image should not prevent the rest of the PDF exporting.
            }
          } else if (annotation.kind === "comment") {
            context.fillStyle = "#f0b644";
            context.beginPath();
            context.arc(annotation.x * px, annotation.y * py, Math.max(8, px * 0.012), 0, Math.PI * 2);
            context.fill();
            context.fillStyle = "#38280b";
            context.font = `bold ${Math.max(9, px * 0.012)}px Arial`;
            context.fillText("!", annotation.x * px - 2, annotation.y * py + 4);
          }
        }
        exportPages.push({
          bytes: dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.94)),
          width: page.width,
          height: page.height,
          pixelWidth: canvas.width,
          pixelHeight: canvas.height,
        });
      }
      const bytes = buildRasterPdf(exportPages);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${documentName.replace(/\.pdf$/i, "") || "annotated-document"}-edited.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice("PDF exported locally. The export is a flattened copy with your edits.");
    } catch {
      setNotice("The PDF could not be exported. Try again with a smaller document.");
    } finally {
      setExporting(false);
    }
  };

  const jumpToPage = (page: number) => {
    setActivePage(page);
    pageRefs.current.get(page)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const fitPage = () => {
    setZoom(1);
    setNotice("Fit to page.");
  };

  return (
    <main className="acrobat-shell">
      <header className="acro-windowbar">
        <div className="acro-traffic" aria-hidden="true"><span /><span /><span /></div>
        <div className="acro-window-title"><span className="acro-app-mark">A</span><strong>AeroPDF</strong><span className="acro-title-divider">/</span><span>{documentName}</span></div>
        <div className="acro-window-state"><span className="acro-state-dot" /> LOCAL EDITION <span className="acro-title-divider">·</span> macOS
        </div>
      </header>

      <div className="acro-commandbar">
        <div className="acro-commandbar__left">
          <button className="acro-command acro-command--primary" type="button" onClick={() => fileInputRef.current?.click()}>
            <Icon name="upload" size={16} /> Open PDF
          </button>
          <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={handlePdfChange} hidden />
          <button className="acro-command" type="button" onClick={makeBlankDocument}>New</button>
          <button className="acro-command" type="button" onClick={exportPdf} disabled={exporting || loading}><Icon name="download" size={16} /> {exporting ? "Exporting…" : "Save PDF"}</button>
        </div>
        <div className="acro-commandbar__center" aria-label="Current document">
          <span className="acro-doc-icon"><Icon name="pages" size={15} /></span>
          <span>{documentName}</span>
          <span className="acro-saved"><Icon name="check" size={13} /> saved locally</span>
        </div>
        <div className="acro-commandbar__right">
          <button className={`acro-icon-button ${searchOpen ? "acro-icon-button--active" : ""}`} type="button" aria-label="Search document" onClick={() => setSearchOpen((current) => !current)}><Icon name="search" size={17} /></button>
          <button className={`acro-icon-button ${commentsOpen ? "acro-icon-button--active" : ""}`} type="button" aria-label="Toggle comments" onClick={() => setCommentsOpen((current) => !current)}><Icon name="comment" size={17} /><span className="acro-count">{comments.length}</span></button>
          <button className="acro-avatar" type="button" title="Local-only profile">AR</button>
        </div>
      </div>

      <div className="acro-body">
        <aside className={`acro-left-rail ${pagesOpen ? "acro-left-rail--open" : ""}`}>
          <div className="acro-rail-tabs" role="tablist" aria-label="Document navigation">
            <button className={pagesOpen ? "acro-rail-tab--active" : ""} type="button" role="tab" aria-selected={pagesOpen} onClick={() => setPagesOpen((current) => !current)}><Icon name="pages" size={17} /><span>Pages</span></button>
            <button className={commentsOpen ? "acro-rail-tab--active" : ""} type="button" role="tab" aria-selected={commentsOpen} onClick={() => setCommentsOpen((current) => !current)}><Icon name="comment" size={17} /><span>Comments</span><b>{comments.length}</b></button>
          </div>
          {pagesOpen ? (
            <div className="acro-pages-panel">
              <div className="acro-panel-heading"><span>DOCUMENT PAGES</span><button type="button" onClick={addPage} aria-label="Add blank page"><Icon name="plus" size={15} /></button></div>
              <div className="acro-thumbnails">
                {pages.map((page) => (
                  <button key={page.page} className={`acro-thumbnail ${page.page === activePage ? "acro-thumbnail--active" : ""}`} type="button" onClick={() => jumpToPage(page.page)}>
                    <span className="acro-thumbnail__number">{String(page.page).padStart(2, "0")}</span>
                    <span className="acro-thumbnail__paper">
                      {page.src ? <img src={page.src} alt={`Page ${page.page}`} /> : page.kind === "sample" ? <span className="acro-thumbnail__sample"><i /><i /><strong /></span> : <span className="acro-thumbnail__blank" />}
                    </span>
                  </button>
                ))}
              </div>
              <div className="acro-page-actions">
                <button type="button" onClick={addPage}><Icon name="plus" size={15} /> Add page</button>
                <button type="button" onClick={deletePage} disabled={pages.length === 1}><Icon name="trash" size={15} /> Delete</button>
              </div>
              <div className="acro-rail-note"><Icon name="lock" size={14} /><span>Local-only workspace<br /><small>Nothing is uploaded.</small></span></div>
            </div>
          ) : null}
        </aside>

        <section className="acro-editor" aria-label="PDF editor">
          <div className="acro-toolbar">
            <div className="acro-toolbar-group acro-toolbar-group--pages">
              <button className="acro-icon-button" type="button" aria-label="Previous page" disabled={activePage === 1} onClick={() => jumpToPage(activePage - 1)}><Icon name="undo" size={15} /></button>
              <label className="acro-page-field"><input aria-label="Current page" value={activePage} onChange={(event) => jumpToPage(Math.min(pages.length, Math.max(1, Number(event.target.value) || 1)))} /><span>/ {pages.length}</span></label>
              <button className="acro-icon-button" type="button" aria-label="Next page" disabled={activePage === pages.length} onClick={() => jumpToPage(activePage + 1)}><Icon name="redo" size={15} /></button>
            </div>
            <div className="acro-toolbar-separator" />
            <div className="acro-tools" role="toolbar" aria-label="PDF editing tools">
              <ToolButton active={activeTool === "select"} label="Select" name="cursor" onClick={() => setActiveTool("select")} />
              <ToolButton active={activeTool === "text"} label="Add text" name="text" onClick={() => setActiveTool("text")} />
              <button className="acro-tool" type="button" title="Add image" onClick={() => imageInputRef.current?.click()}><Icon name="image" size={17} /><span>Image</span></button>
              <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageChange} hidden />
              <ToolButton active={activeTool === "comment"} label="Add comment" name="comment" onClick={() => setActiveTool("comment")} />
              <ToolButton active={activeTool === "highlight"} label="Highlight" name="highlighter" onClick={() => setActiveTool("highlight")} />
              <ToolButton active={activeTool === "draw"} label="Draw" name="pen" onClick={() => setActiveTool("draw")} />
              <ToolButton active={activeTool === "erase"} label="Erase" name="trash" onClick={() => setActiveTool("erase")} />
            </div>
            <div className="acro-toolbar-spacer" />
            {activeTool === "draw" || activeTool === "text" ? <div className="acro-color-picker" aria-label="Ink color">{INK_COLORS.map((color) => <button key={color} type="button" aria-label={`Use ${color}`} className={inkColor === color ? "acro-color--active" : ""} style={{ "--ink": color } as CSSProperties} onClick={() => setInkColor(color)} />)}</div> : null}
            <button className="acro-icon-button" type="button" aria-label="Undo" disabled={!history.length} onClick={undo}><Icon name="undo" size={16} /></button>
            <button className="acro-icon-button" type="button" aria-label="Redo" disabled={!future.length} onClick={redo}><Icon name="redo" size={16} /></button>
            <div className="acro-toolbar-separator" />
            <button className="acro-icon-button" type="button" aria-label="Zoom out" onClick={() => setZoom((current) => Math.max(0.7, Number((current - 0.1).toFixed(2))))}><Icon name="minus" size={15} /></button>
            <span className="acro-zoom-label">{Math.round(zoom * 100)}%</span>
            <button className="acro-icon-button" type="button" aria-label="Zoom in" onClick={() => setZoom((current) => Math.min(1.8, Number((current + 0.1).toFixed(2))))}><Icon name="plus" size={15} /></button>
            <button className="acro-icon-button" type="button" aria-label="Fit page" title="Fit page" onClick={fitPage}><Icon name="fit" size={16} /></button>
          </div>

          {searchOpen ? <div className="acro-searchbar"><Icon name="search" size={16} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search this document" /><span>{searchQuery ? `${searchMatches.length} page${searchMatches.length === 1 ? "" : "s"}` : "Search PDF text"}</span><button type="button" onClick={() => { setSearchQuery(""); setSearchOpen(false); }} aria-label="Close search"><Icon name="close" size={15} /></button></div> : null}

          <div className="acro-stage" aria-label="Document canvas">
            <div className="acro-stage__grid" aria-hidden="true" />
            <div className="acro-paper-stack" style={{ transform: `scale(${zoom})` }}>
              {pages.map((page) => {
                const pageAnnotations = annotations.filter((annotation) => annotation.page === page.page);
                const isDraftPage = draftPage === page.page && draftPoints.length > 1;
                return (
                  <article key={page.page} className={`acro-paper ${page.page === activePage ? "acro-paper--active" : ""}`} data-page={page.page} ref={(element) => { if (element) pageRefs.current.set(page.page, element); else pageRefs.current.delete(page.page); }} style={{ aspectRatio: `${page.width} / ${page.height}` }}>
                    {page.src ? <img className="acro-paper__base" src={page.src} alt={`Page ${page.page} of ${documentName}`} draggable={false} /> : page.kind === "sample" ? samplePageMarkup() : <div className="acro-blank-page" aria-label={`Blank page ${page.page}`} />}
                    <div className="acro-annotation-layer" data-page={page.page} onPointerDown={(event) => handlePagePointerDown(event, page.page)} onPointerMove={handlePagePointerMove} onPointerUp={handlePagePointerUp} onPointerCancel={handlePagePointerUp}>
                      {pageAnnotations.map((annotation) => {
                        const selected = annotation.id === selectedId;
                        if (annotation.kind === "draw" || annotation.kind === "highlight") {
                          return <svg key={annotation.id} className={`acro-stroke ${selected ? "acro-stroke--selected" : ""}`} viewBox="0 0 1 1" preserveAspectRatio="none" onPointerDown={(event) => beginDrag(event, annotation)}><polyline points={(annotation.points ?? []).map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={annotation.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={annotation.kind === "highlight" ? 0.035 : 0.006} opacity={annotation.opacity} /></svg>;
                        }
                        if (annotation.kind === "image") {
                          return <div key={annotation.id} className={`acro-object acro-image-object ${selected ? "acro-object--selected" : ""}`} style={annotationStyle(annotation)} onPointerDown={(event) => beginDrag(event, annotation)}><img src={annotation.src} alt="Inserted document image" draggable={false} /></div>;
                        }
                        if (annotation.kind === "comment") {
                          return <button key={annotation.id} className={`acro-comment-pin ${selected ? "acro-comment-pin--selected" : ""}`} style={annotationStyle(annotation)} type="button" onPointerDown={(event) => { event.stopPropagation(); selectAnnotation(annotation); }} aria-label={`Comment on page ${annotation.page}`}>!</button>;
                        }
                        return <div key={annotation.id} className={`acro-object acro-text-object ${selected ? "acro-object--selected" : ""}`} style={{ ...annotationStyle(annotation), color: annotation.color, fontSize: `${(annotation.fontSize ?? fontSize) * 100}cqw` }} onPointerDown={(event) => beginDrag(event, annotation)}>{editingTextId === annotation.id ? <textarea autoFocus value={annotation.text ?? ""} onChange={(event) => updateAnnotation(annotation.id, { text: event.target.value })} onBlur={() => setEditingTextId(null)} aria-label="Edit added text" /> : <span onDoubleClick={() => setEditingTextId(annotation.id)}>{annotation.text}</span>}</div>;
                      })}
                      {isDraftPage ? <svg className="acro-stroke acro-stroke--draft" viewBox="0 0 1 1" preserveAspectRatio="none"><polyline points={draftPoints.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={activeTool === "highlight" ? "#f3cf4f" : inkColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTool === "highlight" ? 0.035 : 0.006} opacity={activeTool === "highlight" ? 0.38 : 0.9} /></svg> : null}
                      {selectedAnnotation && selectedAnnotation.page === page.page && activeTool === "select" ? <div className="acro-selection-box" style={{ left: `${(boundsForAnnotation(selectedAnnotation).x - 0.008) * 100}%`, top: `${(boundsForAnnotation(selectedAnnotation).y - 0.008) * 100}%`, width: `${(boundsForAnnotation(selectedAnnotation).width + 0.016) * 100}%`, height: `${(boundsForAnnotation(selectedAnnotation).height + 0.016) * 100}%` }}><button type="button" onClick={(event) => { event.stopPropagation(); deleteSelected(); }} aria-label="Delete selected annotation"><Icon name="trash" size={14} /></button></div> : null}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="acro-stage-hint"><span className="acro-hint-key">{activeTool === "select" ? "SELECT" : activeTool.toUpperCase()}</span><span>{activeTool === "select" ? "Choose an object to move or delete" : activeTool === "text" ? "Click anywhere on the page to add text" : activeTool === "comment" ? "Click a page to place a comment" : activeTool === "image" ? "Choose an image from the toolbar" : "Draw directly on the page"}</span></div>
          </div>
          <div className="acro-statusbar"><span className={loading ? "acro-loading" : ""}>{loading ? "Rendering document…" : notice}</span><span>{documentKind === "pdf" ? "PDF" : "LOCAL DOCUMENT"} <b>·</b> {pages.length} {pages.length === 1 ? "page" : "pages"} <b>·</b> {annotations.length} edits</span></div>
        </section>

        {commentsOpen ? <aside className="acro-comments-panel">
          <div className="acro-comments-heading"><div><span className="acro-overline">REVIEW</span><h2>Comments <b>{comments.length}</b></h2></div><button className="acro-icon-button" type="button" aria-label="Close comments" onClick={() => setCommentsOpen(false)}><Icon name="close" size={16} /></button></div>
          <div className="acro-comments-helper">Keep notes beside the page. They are included as markers in your local export.</div>
          <div className="acro-comments-list">
            {comments.length === 0 ? <div className="acro-empty-comments"><span className="acro-empty-icon"><Icon name="comment" size={21} /></span><strong>No comments yet</strong><p>Choose Add comment, then click anywhere on the page.</p><button type="button" onClick={() => setActiveTool("comment")}>Add a comment</button></div> : comments.map((comment, index) => <article key={comment.id} className={`acro-comment-card ${selectedId === comment.id ? "acro-comment-card--active" : ""}`} onClick={() => { setSelectedId(comment.id); jumpToPage(comment.page); }}><div className="acro-comment-card__meta"><span className="acro-comment-index">{String(index + 1).padStart(2, "0")}</span><span>PAGE {comment.page}</span><span className="acro-comment-card__time">now</span></div><textarea value={comment.text ?? ""} onChange={(event) => updateAnnotation(comment.id, { text: event.target.value })} aria-label={`Comment ${index + 1}`} /><div className="acro-comment-card__footer"><span><span className="acro-comment-dot" /> Arafat</span><button type="button" onClick={(event) => { event.stopPropagation(); deleteAnnotation(comment.id); }} aria-label={`Delete comment ${index + 1}`}><Icon name="trash" size={14} /></button></div></article>)}
          </div>
          <button className="acro-add-comment" type="button" onClick={() => setActiveTool("comment")}><Icon name="plus" size={15} /> Add comment</button>
        </aside> : null}
      </div>

      {searchOpen && searchQuery ? <div className="acro-search-results"><span className="acro-overline">SEARCH RESULTS</span>{searchMatches.length ? searchMatches.map((page) => <button key={page.page} type="button" onClick={() => jumpToPage(page.page)}><span>Page {page.page}</span><small>{(pageText[page.page] ?? "").slice(0, 90)}…</small><Icon name="chevron" size={14} /></button>) : <p>No matching page text.</p>}</div> : null}
    </main>
  );
}
