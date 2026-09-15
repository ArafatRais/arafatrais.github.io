import Link from "next/link";

export default function Home() {
  return (
    <main className="site-shell home-shell">
      <header className="site-header">
        <Link className="brand-mark" href="/">
          <span className="brand-mark__signal" aria-hidden="true" />
          AR // TOOLS
        </Link>
        <span className="header-status">
          <span className="status-dot" aria-hidden="true" />
          PERSONAL SYSTEMS
        </span>
      </header>

      <section className="home-intro" aria-labelledby="home-title">
        <div>
          <p className="eyebrow">Arafat Rais / instrument rack</p>
          <h1 id="home-title">
            Small tools for
            <span>useful work.</span>
          </h1>
          <p className="home-copy">
            A private collection of projects, experiments, and the tools I use
            to teach, study, and build.
          </p>
        </div>
        <div className="home-index mono" aria-label="Site index">
          <span>INDEX</span>
          <strong>01 / 01</strong>
        </div>
      </section>

      <section className="tool-rack" aria-labelledby="tools-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Available now</p>
            <h2 id="tools-title">Tools</h2>
          </div>
          <span className="section-rule" aria-hidden="true" />
        </div>

        <Link className="tool-card tool-card--featured" href="/acrobat">
          <div className="tool-card__index mono">01</div>
          <div className="tool-card__body">
            <div className="tool-card__topline">
              <span className="eyebrow">Free / local-first</span>
              <span className="tool-card__arrow" aria-hidden="true">
                ↗
              </span>
            </div>
            <h3>AeroPDF editor</h3>
            <p>
              A focused macOS-style PDF workspace for editing pages, adding
              text, images, highlights, and comments without an account.
            </p>
            <div className="tool-card__tags mono">
              <span>PDF</span>
              <span>EDIT</span>
              <span>COMMENTS</span>
            </div>
          </div>
          <div className="tool-card__preview" aria-hidden="true">
            <div className="mini-paper">
              <span className="mini-paper__line mini-paper__line--long" />
              <span className="mini-paper__line" />
              <span className="mini-paper__scribble" />
              <span className="mini-paper__dot" />
            </div>
          </div>
        </Link>
      </section>

      <footer className="site-footer">
        <span>ARAFAT RAIS</span>
        <span className="mono">LOCAL-FIRST / 2026</span>
      </footer>
    </main>
  );
}
