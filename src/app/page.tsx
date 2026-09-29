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
          <strong>01 / 02</strong>
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

        <Link className="tool-card" href="/bingo/">
          <div className="tool-card__index mono">02</div>
          <div className="tool-card__body">
            <div className="tool-card__topline">
              <span className="eyebrow">Meet / mingle / play</span>
              <span className="tool-card__arrow" aria-hidden="true">
                ↗
              </span>
            </div>
            <h3>Human Bingo</h3>
            <p>
              A phone-friendly icebreaker card. Find someone who fits a prompt,
              add their name, and try to make a line.
            </p>
            <div className="tool-card__tags mono">
              <span>30 PROMPTS</span>
              <span>ICEBREAKER</span>
              <span>PHONE READY</span>
            </div>
          </div>
          <div className="tool-card__preview" aria-hidden="true">
            <div
              style={{
                background: "#fbf7ed",
                border: "1px solid #ded9cb",
                boxShadow: "18px 18px 0 rgba(0, 0, 0, 0.14)",
                display: "grid",
                gap: 5,
                gridTemplateColumns: "repeat(5, 22px)",
                padding: 14,
                transform: "rotate(-5deg)",
              }}
            >
              {Array.from({ length: 15 }, (_, index) => (
                <span
                  key={index}
                  style={{
                    aspectRatio: "1",
                    background: [2, 6, 8, 12].includes(index)
                      ? "#ef7858"
                      : "#e3eadb",
                    border: "1px solid #d6ddce",
                  }}
                />
              ))}
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
