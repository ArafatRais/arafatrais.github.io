# Adobe Acrobat Pro: app-wide feature research

**Research date:** 14 September 2026  
**Scope:** Current subscription Acrobat Pro across the desktop app, web app, mobile apps, browser extensions, Adobe Scan, Acrobat Sign workflows, cloud collaboration, and the newer AI/Adobe Express surfaces.

## Bottom line

Adobe Acrobat Pro is much more than a PDF editor. Its desktop application is a broad document-production and governance tool covering:

- PDF creation, scanning, OCR, conversion, compression, and export
- Text, image, page, layer, metadata, attachment, header/footer, watermark, and Bates-number editing
- Document comparison, commenting, stamps, shared review, and cloud-based collaboration
- Fillable forms, web forms, reusable templates, e-signature requests, bulk sending, and certificate-based digital signatures
- Password protection, certificate encryption, redaction, sanitization, protected view, and security policies
- Accessibility repair and authoring, including tags, reading order, alternate text, accessible forms, and full checks
- Print-production controls such as Preflight, Output Preview, PDF/X, color conversion, printer marks, bleed boxes, and transparency flattening
- Action Wizard automation, watched folders, PDF Optimizer, PDF Portfolios, 3D models, rich media, and geospatial PDFs

The important product boundary is that **base Acrobat Pro is the advanced PDF/e-signature plan; it is not automatically the full generative-AI and content-creation bundle**. Adobe currently positions AI Assistant, PDF Spaces, and premium Adobe Express creation mainly in Acrobat Studio or through an AI Assistant add-on. Availability also varies by plan, platform, language, region, and phased rollout. Adobe’s [current plan comparison](https://www.adobe.com/acrobat/pricing.html) and [feature overview](https://www.adobe.com/acrobat/features.html) are the best sources for entitlement changes.

## 1. What the app is made of

Acrobat is best understood as a family of connected surfaces rather than one identical app everywhere:

| Surface | What it is best at | Important distinction |
|---|---|---|
| **Acrobat desktop for Windows/macOS** | Full PDF editing, page assembly, OCR, redaction, accessibility, print production, automation, specialist tools | The deepest feature set; many professional tools are desktop-only |
| **Acrobat on the web** | Browser-based PDF creation, editing, conversion, organization, sharing, review, forms, and signatures | Cloud-first workflows; it does not expose every desktop production tool |
| **Acrobat mobile for iOS/Android** | Reading, search, annotations, fill/sign, sharing, basic editing and export on the go | Smaller feature set; one PDF at a time and feature access depends on plan |
| **Chrome/Edge extensions** | Convert web pages to PDF and perform quick view, comment, fill/sign, compression, and editing tasks | Convenience layer, not a replacement for desktop Acrobat |
| **Adobe Scan** | Capture paper documents, OCR them, clean up images, and send them into Acrobat/cloud workflows | Separate capture app within the Acrobat ecosystem |
| **Acrobat Sign workflows** | Request, route, authenticate, track, and audit e-signatures | Advanced enterprise identity, volume, and administration may require Acrobat Sign offerings beyond Pro |
| **PDF Spaces / Adobe Express** | Multi-file AI research, summaries, presentations, podcasts, and designed content | Primarily Studio or AI-enabled capabilities, not the base Pro entitlement |

The desktop workspace includes a Home view for recent and starred files, Adobe cloud files, scans, shared items, agreements, notifications, connected storage such as Box, Dropbox, Google Drive, OneDrive, and SharePoint, plus search and help. In a document, the global bar exposes All tools, Edit, Convert, and E-sign; the right-side navigation can expose comments, bookmarks, page thumbnails, article flow, page display, and zoom. The quick toolbar is customizable. See Adobe’s [workspace guide](https://helpx.adobe.com/acrobat/desktop/get-started/learn-the-basics/workspace.html) and [desktop Help hub](https://helpx.adobe.com/acrobat/desktop.html).

## 2. Plan boundary: Standard, Pro, and Studio

The following is a practical reading of Adobe’s current U.S. comparison. Prices and entitlements can differ by country, contract, platform, and promotion.

| Capability | Acrobat Standard | Acrobat Pro | Acrobat Studio / AI-enabled Acrobat |
|---|---:|---:|---:|
| View, print, search, comment, share, fill, and sign | Yes | Yes | Yes |
| Create PDFs, edit ordinary text/images, convert, combine, organize pages | Yes | Yes | Yes |
| OCR and editing of scanned documents | Limited/plan dependent | Yes | Yes |
| Compare PDF versions | No or limited | Yes | Yes |
| Redact and sanitize sensitive information | No or limited | Yes | Yes |
| Create web forms and reusable e-sign templates | No or limited | Yes | Yes |
| Bulk signature requests and agreement tracking | No or limited | Yes, with plan limits | Yes, with plan limits |
| Brand agreements with logos/custom URLs | No or limited | Yes | Yes |
| AI Assistant, generative summaries, cited Q&A, PDF Spaces | Add-on/availability dependent | Add-on/availability dependent | Included in Studio |
| AI presentations/podcasts and Adobe Express Premium creation | No | Usually add-on/Studio | Included in Studio |

Adobe’s current pricing page lists Acrobat Pro at **US$19.99/month when billed annually** for individuals, with other monthly and prepaid options; prices change, so treat this as a dated reference rather than a permanent quote. The same page positions Studio as Pro plus AI Assistant, PDF Spaces, and Adobe Express Premium. Adobe also lists an AI Assistant add-on for eligible plans. See the [current pricing and comparison page](https://www.adobe.com/acrobat/pricing.html).

## 3. Desktop feature map

### Create and acquire PDFs

Acrobat can create PDFs from Office files, text, images, web pages, the clipboard, scanned pages, PostScript, EPS, XPS, and many specialist formats. Its desktop documentation covers Office documents, common raster images, HTML, AutoCAD, Visio, Project, WordPerfect, OpenDocument formats, Adobe design files, and selected 3D formats. It can also create a PDF from a print workflow.

On Windows, PDFMaker adds Acrobat controls to Microsoft Word, Excel, PowerPoint, and Outlook. It can preserve hyperlinks, internal links, tables of contents, bookmarks, document properties, and selected protection settings. Outlook messages and folders can be combined into one PDF or a PDF Portfolio. See Adobe’s [supported file-format guide](https://helpx.adobe.com/acrobat/desktop/get-started/learn-the-basics/file-formats.html) and [PDFMaker guide](https://helpx.adobe.com/acrobat/using/creating-pdfs-pdfmaker-windows.html).

Scanning covers single- or double-sided capture, creating or appending to a PDF, image optimization, metadata, PDF/A output, and OCR. OCR makes image-only scans selectable and searchable; Acrobat can flag uncertain OCR results as “suspects” for review. Scanned-PDF settings include deskew, descreen, background removal, text sharpening, adaptive compression, and OCR language/output choices. Adobe documents [scanning](https://helpx.adobe.com/acrobat/desktop/create-documents/scan-documents-to-pdfs/scan.html), [OCR](https://helpx.adobe.com/acrobat/desktop/create-documents/scan-documents-to-pdfs/recognize-text.html), and [editing scans](https://helpx.adobe.com/acrobat/desktop/create-documents/scan-documents-to-pdfs/edit-scans.html) separately because scan quality and document structure materially affect results.

### Edit content and document structure

The Edit tool can add, replace, delete, resize, and format text; change fonts, type size, alignment, bullets, numbering, and paragraph properties; and add or modify images and other objects. It can add links, attachments, metadata, backgrounds, watermarks, headers, footers, page numbers, and Bates numbering.

Page management is particularly strong: insert, delete, move, copy, rotate, replace, crop, renumber, split, extract, combine, and add blank pages. Acrobat can split by page count, file size, or top-level bookmarks, and can work across multiple input PDFs. It can also insert pages from a file, the clipboard, a scanner, a web page, or a blank page. See Adobe’s [editing guide](https://helpx.adobe.com/acrobat/using/edit-text-pdfs1.html), [organizing pages](https://helpx.adobe.com/acrobat/desktop/edit-documents/organize-pages/organize-pages.html), [splitting PDFs](https://helpx.adobe.com/acrobat/desktop/edit-documents/organize-pages/split-pdfs.html), and [extracting pages](https://helpx.adobe.com/acrobat/desktop/edit-documents/organize-pages/extract-pages.html).

Other desktop structures include:

- **Layers:** import, reorder, show/hide, edit layer properties, add layer navigation, merge, and flatten layers.
- **PDF Portfolios:** assemble multiple files into one navigable package while retaining each component’s native identity; add folders, sort/search, preview, extract, print, and in some cases edit component files. See Adobe’s [Portfolio overview](https://helpx.adobe.com/acrobat/using/overview-pdf-portfolios.html).
- **Links and attachments:** create internal page links, web links, file-opening links, custom links, and attachments.
- **PDF actions:** attach actions to page elements or page thumbnails, including navigation and other document behaviors.
- **Geospatial PDFs:** import or create geospatial content, find locations, measure distance/area, customize measurement settings, and export markups.
- **3D and rich media:** add and inspect U3D/PRC models, change projection/rendering/lighting/background, inspect the model tree, and interact with parts. Acrobat can also place supported video and audio in PDFs, subject to format and security restrictions. See Adobe’s [3D model guide](https://helpx.adobe.com/acrobat/using/adding-3d-models-pdfs-acrobat.html).

Acrobat is not a full page-layout authoring application. PDF edits are object- and text-box-oriented; complex layouts, unavailable fonts, tables, or heavily designed pages may need correction in the source application. Adobe explicitly notes that complex web editing layouts may require manual adjustment.

### Convert, export, and optimize

Acrobat exports PDFs to Word/DOCX, Excel/XLSX, PowerPoint/PPTX, images, HTML, plain text, RTF, PostScript/EPS, and other formats. It can export pages or selected content, and it supports PDF/A, PDF/E, PDF/X, and multiple PDF version targets.

PDF Optimizer provides controls for image downsampling and compression, font embedding/unembedding, transparency flattening, removal of objects and user data, cleanup of invalid links/bookmarks, and Fast Web View. It can batch-compress multiple PDFs. Because optimization can discard comments, forms, multimedia, metadata, attachments, or other content, Adobe’s settings should be treated as a production operation, not just a size slider. See [PDF Optimizer settings](https://helpx.adobe.com/uk/acrobat/desktop/create-documents/optimize-pdfs/pdf-optimizer-settings.html).

### Compare and review changes

Compare Documents can compare two PDF versions, choose page ranges, detect different content types, and generate a summary report. It can identify changes in text, graphics, images, formatting, and backgrounds, then show results side-by-side with filters and comment/status support. Adobe documents presets for reports, spreadsheets, presentations, scanned documents, magazines, and drawings. See [Compare Documents](https://helpx.adobe.com/acrobat/using/compare-documents.html).

### Forms

Acrobat can convert an existing Word document, PDF, or scan into a fillable form by detecting likely fields. It can also create forms from scratch and then align, copy, move, resize, rename, customize, and delete fields.

Supported form controls include text fields, checkboxes, radio buttons, list boxes, combo boxes, buttons, signature fields, barcodes, and date-related fields. Advanced field properties cover tooltips, multiline input, formatting, validation, navigation order, calculations, and actions. Calculations can support common operations such as sum, product, average, minimum, and maximum. Acrobat can enable Reader users to fill and save forms, distribute forms, collect responses, track status, and produce certified copies. See Adobe’s [forms overview](https://helpx.adobe.com/acrobat/using/pdf-forms.html) and [form-conversion guide](https://helpx.adobe.com/acrobat/desktop/work-with-pdf-forms/create-forms/convert-to-forms.html).

Pro can also create hosted **web forms** with role assignment, signing order, authentication choices, shareable URLs, and embed options. Adobe identifies web-form creation as a Pro/Pro for teams capability. See [Create web forms](https://helpx.adobe.com/acrobat/web/e-sign-documents/work-with-webforms/create-web-forms.html).

### E-signatures and digital signatures

Acrobat has several distinct signing layers:

1. **Fill & Sign:** type, draw, or place an image of a signature, fill fields, and complete a document.
2. **Request e-signatures:** send an agreement to one or more recipients, set a signing order, place required fields, add reminders, and track completion through Acrobat Sign-backed workflows.
3. **Bulk requests:** send independent agreements to many recipients; each agreement has its own completion and audit trail. Adobe documents this as a Pro/Pro for teams feature, with plan-specific limits.
4. **Certificate-based digital signatures:** sign with a Digital ID/certificate, lock or certify documents, establish trust, add timestamps, and validate signatures and signed versions.

Recipients can generally sign from a browser or mobile device, but authentication methods, transaction volume, signer limits, and enterprise controls vary by contract and region. For high-volume or advanced identity workflows, Acrobat Sign Solutions/enterprise products may be more appropriate than individual Acrobat Pro. See Adobe’s [signature overview](https://helpx.adobe.com/acrobat/desktop/e-sign-documents/request-e-signatures/send-for-signing.html), [bulk-signing guide](https://helpx.adobe.com/acrobat/desktop/e-sign-documents/request-e-signatures/request-in-bulk.html), and [digital-signature guide](https://helpx.adobe.com/acrobat/desktop/e-sign-documents/fill-sign-documents/add-digital-sign.html).

### Review and collaboration

Acrobat can share a PDF as a cloud link, control whether access is open to anyone, limited to an organization, or limited to invited people, set deadlines in supported workflows, allow comments, and track activity. Reviewers can comment in a browser or desktop app, reply, react, resolve, filter, sort, and mark comments unread. Comment types include sticky notes, highlights, text insertion/replacement, callouts, text boxes, file attachments, stamps, shapes, freeform drawings, and selected video-comment workflows.

Comments can be summarized or exported, including to data or Word in supported workflows. Shared reviews can run through Adobe cloud or, for organizations with an established infrastructure, through internal network folders, SharePoint, or web servers. Sign-in requirements can differ between an open viewing link and a managed commenting/review workflow, so organizations should test the exact sharing mode they intend to use. See Adobe’s [PDF sharing guide](https://helpx.adobe.com/acrobat/desktop/share-and-review-documents/share-documents/share-pdfs.html) and [comment-review guide](https://helpx.adobe.com/acrobat/desktop/share-and-review-documents/review-documents/view-comments.html).

### Protect, redact, and sanitize

Security features include:

- Passwords for opening documents and restricting printing, editing, copying, or changes
- Certificate-based encryption with recipient-specific trust and permissions
- Digital IDs, trusted identities, signature validation, and certificate management
- True redaction of text, images, and patterns, with appearance controls and code sets
- Sanitization of hidden metadata, comments, layers, attachments, and other hidden information
- Protected View/Protected Mode sandboxing for untrusted content
- Enhanced security, privileged locations, JavaScript controls, attachment/link risk controls, and security policies

Redaction is not the same as drawing a black rectangle over text. The redaction must be applied and the sanitized copy saved; Adobe’s [redaction guide](https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/redact.html) and [sanitization guide](https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/sanitize.html) describe the workflow. These operations can be irreversible, so the original should be preserved separately.

### Accessibility

Acrobat Pro can author and repair accessible PDFs. Relevant tools include Accessibility Setup Assistant, tagging untagged PDFs, adjusting reading order, editing the document structure/tag tree, adding alternate text, setting document language, creating accessible forms, adding navigational aids, and running Full Check/accessibility reports. Read Out Loud, reflow, screen-reader support, magnification, and braille-oriented text access support consumption.

Adobe’s guidance emphasizes that fixing accessibility in the source document is preferable when possible, but Pro can repair common PDF-level problems. See [Adobe’s accessibility overview](https://helpx.adobe.com/acrobat/using/accessibility-features-pdfs.html) and [Reading Order guidance](https://helpx.adobe.com/acrobat/using/touch-reading-order-tool-pdfs.html).

### Print production and publishing

For professional print and prepress, Acrobat Pro includes a separate Print Production toolset:

- **Output Preview:** separations, soft proofing, and color warnings
- **Preflight:** hundreds of checks and fixups for fonts, colors, transparency, image resolution, ink coverage, PDF version, syntax, structure, and standards
- **Convert Colors:** convert document colors to target spaces
- **Flattener Preview:** inspect or flatten transparency
- **Edit Object:** inspect and change raster/vector object properties
- **Set Page Boxes:** crop, trim, bleed, art, and media boxes
- **Add Printer Marks** and **Fix Hairlines**
- **Ink Manager:** inspect/control ink behavior where supported
- **Save as PDF/X**, plus PDF/A, PDF/E, and output-intent workflows

Preflight can produce PDF, XML, or text reports and can inventory fonts, colors, images, XMP metadata, and other production properties. Fixups can change the document permanently, so production copies and preflight reports should be retained. See Adobe’s [Print Production overview](https://helpx.adobe.com/acrobat/using/print-production-tools-overview-acrobat.html) and [Preflight guide](https://helpx.adobe.com/acrobat/using/preflight-reports-acrobat-pro.html).

### Automation and batch work

Action Wizard lets users build reusable sequences such as “open files, OCR, remove metadata, optimize, save, and close.” Actions can run on one document, multiple files, or a collection; they can also include preparatory steps such as scanning or combining files. Actions can be imported and exported for reuse across users or machines. Watched folders, PDF Optimizer, Preflight droplets, and batch processing extend this model for repeatable production. See [Action Wizard](https://helpx.adobe.com/acrobat/using/Action-wizard-acrobat-pro.html).

## 4. Web, mobile, and browser coverage

### Web

Acrobat on the web is a capable cloud PDF workspace: create, edit, organize, combine, convert, compress, protect, share, comment, fill, sign, and request signatures. Files in Adobe cloud can be accessed from the browser, and integrations can expose Acrobat workflows inside SharePoint and OneDrive, subject to administrator provisioning. The web Read panel can provide summaries, read-aloud, presentations, interactive reports, and other reading views when the account has access to those features. See Adobe’s [web overview](https://helpx.adobe.com/acrobat/web/get-set-up/learn-the-basics/overview.html).

The web editor is strongest for ordinary text, image, page, and form changes. Complex layouts, advanced prepress, deep accessibility repair, full redaction workflows, specialist 3D/geospatial work, Action Wizard, and other production features remain primarily desktop territory.

### Mobile

Free mobile Acrobat supports viewing, search, comments/annotations, fill/sign, and secure sharing. Paid access adds editing text/images, export, password protection, page organization, collaboration, and selected AI features. Mobile can rename, move, delete, combine, and organize PDFs, use collections/folders, read aloud, switch reading modes, and use Liquid Mode where the document qualifies.

Paid export can produce Word, Excel, PowerPoint, RTF, and images; OCR can assist document export, although image export has different behavior. Mobile does not provide the desktop experience of multiple open PDF tabs, and Liquid Mode has limitations for large, scanned, encrypted, presentation-style, complex, or unsupported-language documents. See the [mobile FAQ](https://helpx.adobe.com/acrobat/mobile/get-started/faqs.html) and [mobile overview](https://helpx.adobe.com/acrobat/mobile/get-started/overview.html).

### Browser extensions

The Chrome and Edge extensions provide quick access to convert a web page to PDF, view and comment, fill and sign, compress, and perform selected edit/convert/combine/organize actions. They are useful for capture and lightweight browser workflows but do not expose the full desktop toolset. See Adobe’s [Chrome extension guide](https://helpx.adobe.com/acrobat/using/enable-createpdf-extension-chrome.html).

## 5. AI, PDF Spaces, and Adobe Express

Adobe’s current AI layer includes:

- Questions and answers about a PDF with source-linked citations
- Generative summaries with sections, links, and follow-up questions
- Multi-file research in PDF Spaces, including files, pasted text, and selected web/cloud sources
- Suggested questions and smart actions
- Conversational editing such as rewriting or replacing text, adding highlights, reorganizing pages, or applying headers, footers, and watermarks
- Generate Presentation and Generate Podcast experiences
- AI-assisted cover pages, dashboards, reports, timelines, and interactive experiences
- Adobe Express templates, image generation, background removal, resizing, and designed collateral

PDF Spaces are designed as an AI knowledge workspace rather than a single-document reader. Adobe’s current documentation allows up to 100 source files, with per-file/page limits, and supports citations, notes, sharing, and personalized assistants. Supported inputs include PDFs, DOCX, PPTX, XLSX, TXT, RTF, VTT, pasted text, selected cloud files, and public web links; password-protected files, videos, handwritten notes, and some complex vector content are unsupported. See the [PDF Spaces FAQ](https://helpx.adobe.com/acrobat/desktop/explore-pdf-spaces/pdf-spaces-faq.html) and [supported formats/limits](https://helpx.adobe.com/acrobat/desktop/explore-pdf-spaces/supported-formats-limitations.html).

AI features are cloud-processed, can be subject to usage limits or throttling, and should be reviewed like any other automated extraction or rewrite. Adobe’s current policy says AI availability and request allowances depend on plan and can change; it also notes that AI outputs should be checked. See the [AI overview](https://helpx.adobe.com/acrobat/desktop/use-acrobat-ai/get-started-with-generative-ai/acrobat-ai-overview.html) and [usage policy](https://helpx.adobe.com/acrobat/desktop/use-acrobat-ai/understand-usage-policies/ai-usage-policy-limitations.html).

The practical entitlement rule is:

- If the need is editing, conversion, OCR, forms, signatures, security, comparison, or print production, evaluate **Acrobat Pro**.
- If the need is cited multi-document research, PDF Spaces, generative presentation/podcast workflows, or Adobe Express content creation, evaluate **Acrobat Studio** or the relevant AI add-on.
- Do not assume that a feature visible in the web or mobile UI is included in every Pro contract; Adobe’s release notes explicitly describe phased rollouts and plan-dependent availability. See the [desktop release notes](https://helpx.adobe.com/acrobat/desktop/whats-new/whats-new-acrobat-desktop.html) and [web release notes](https://helpx.adobe.com/ie/acrobat/web/whats-new/release-notes.html).

## 6. Strengths and limitations by use case

| Use case | Acrobat Pro fit | Main caveat |
|---|---|---|
| Legal discovery and case files | Strong: Bates, compare, redaction, sanitize, portfolios, review, signatures | Redaction must be applied correctly; enterprise governance may require additional products |
| Compliance and regulated documents | Strong: permissions, encryption, certificates, accessibility, PDF/A, audit-oriented signing | Policies, identity assurance, and retention are organization-specific |
| Operations and back office | Strong: OCR, forms, batch actions, combine/split, signatures, cloud sharing | Automation is powerful but less developer-oriented than a workflow platform |
| Marketing and document content | Good for PDF finishing; better with Studio/Express | Acrobat is not a full layout/design suite |
| Print and publishing | Strong: Preflight, Output Preview, PDF/X, color/marks/bleed | Prepress still requires correct source files, profiles, and production judgment |
| Research and knowledge work | Good for single PDFs; excellent with AI/PDF Spaces entitlement | AI is plan-dependent, cloud-processed, usage-limited, and must be verified |
| Everyday consumer PDF tasks | Often more than needed | Reader or Standard may be sufficient |

The most defensible reason to buy Pro over Standard is not simply “more editing.” It is the combination of **OCR/editable scans, compare, true redaction/sanitization, advanced forms/web forms, reusable and bulk e-signature workflows, accessibility repair, and professional print-production controls**.

## 7. Practical assessment

Choose Acrobat Pro when PDFs are a core business artifact and you need to create, repair, compare, sign, secure, review, or produce them repeatedly. It is particularly well suited to legal, compliance, operations, education administration, publishing, and organizations already using Microsoft 365, SharePoint, Adobe cloud, or Acrobat Sign.

Choose Standard or Reader when the workflow is mostly viewing, commenting, filling, signing, basic combining, and occasional conversion. Choose Studio or add the AI layer when the primary value is multi-document synthesis, citations, interactive outputs, podcasts/presentations, or design work.

The principal risks are feature fragmentation across surfaces, recurring subscription/entitlement changes, source-document and font limitations, OCR errors, the irreversible nature of optimization/redaction fixups, and the need to verify AI-generated content. Desktop Acrobat remains the reference environment for serious PDF production; web and mobile are complementary access and collaboration layers.

## Selected official sources

- [Acrobat features](https://www.adobe.com/acrobat/features.html)
- [Acrobat pricing and plan comparison](https://www.adobe.com/acrobat/pricing.html)
- [Acrobat desktop Help hub](https://helpx.adobe.com/acrobat/desktop.html)
- [Desktop workspace](https://helpx.adobe.com/acrobat/desktop/get-started/learn-the-basics/workspace.html)
- [Supported file formats](https://helpx.adobe.com/acrobat/desktop/get-started/learn-the-basics/file-formats.html)
- [Scanning and OCR](https://helpx.adobe.com/acrobat/desktop/create-documents/scan-documents-to-pdfs/scan.html)
- [Compare Documents](https://helpx.adobe.com/acrobat/using/compare-documents.html)
- [Forms](https://helpx.adobe.com/acrobat/using/pdf-forms.html)
- [Request signatures](https://helpx.adobe.com/acrobat/desktop/e-sign-documents/request-e-signatures/send-for-signing.html)
- [Redaction](https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/redact.html)
- [Accessibility](https://helpx.adobe.com/acrobat/using/accessibility-features-pdfs.html)
- [Print Production](https://helpx.adobe.com/acrobat/using/print-production-tools-overview-acrobat.html)
- [Action Wizard](https://helpx.adobe.com/acrobat/using/Action-wizard-acrobat-pro.html)
- [AI overview](https://helpx.adobe.com/acrobat/desktop/use-acrobat-ai/get-started-with-generative-ai/acrobat-ai-overview.html)
- [PDF Spaces FAQ](https://helpx.adobe.com/acrobat/desktop/explore-pdf-spaces/pdf-spaces-faq.html)
- [Mobile FAQ](https://helpx.adobe.com/acrobat/mobile/get-started/faqs.html)
- [Desktop release notes](https://helpx.adobe.com/acrobat/desktop/whats-new/whats-new-acrobat-desktop.html)
- [Web release notes](https://helpx.adobe.com/ie/acrobat/web/whats-new/release-notes.html)
