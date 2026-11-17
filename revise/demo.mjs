// Fake data for REVISE_DEMO=1, so the UI can be tried without a Notion token.
let n = 0;
const id = () => `demo-${++n}`;
const p = (html) => ({ id: id(), type: "paragraph", html, children: [] });
const bullet = (html, children = []) => ({ id: id(), type: "bulleted_list_item", html, children });
const toggle = (html, children = [], type = "toggle") => ({ id: id(), type, toggle: true, html, children });

export const demoPages = [
  { id: "demo-page-1", title: "Lecture 4: Cardiac physiology", edited: new Date().toISOString() },
  { id: "demo-page-2", title: "Lecture 5: Renal physiology", edited: new Date().toISOString() },
];

export function demoTree(pageId) {
  n = 0;
  const tree = [
    p("Intro text that sits outside any toggle, so it just shows in order."),
    toggle("What is the cardiac output?", [
      p("<strong>CO = HR × SV</strong>. At rest about 5 L/min."),
      bullet("Heart rate: set by the SA node"),
      bullet("Stroke volume: preload, afterload, contractility"),
    ]),
    toggle(
      "Phases of the cardiac action potential",
      [
        p("Ventricular myocytes have five phases."),
        toggle("Phase 0", [p("Rapid depolarisation via fast Na<sup>+</sup> channels.")]),
        toggle("Phase 2 (plateau)", [p("Ca<sup>2+</sup> influx balances K<sup>+</sup> efflux, which is why the contraction is long.")]),
        p("Phase 4 is the resting potential, about −90 mV."),
      ],
      "heading_2",
    ),
    p("A line of text between toggles."),
    toggle("Frank-Starling law", [p("Greater end-diastolic volume gives a greater stroke volume, up to a limit.")]),
    toggle("Baroreceptor reflex", [p("Carotid sinus and aortic arch detect stretch. A fall in pressure raises sympathetic outflow.")]),
  ];
  return { id: pageId, title: demoPages.find((d) => d.id === pageId)?.title ?? "Demo page", url: "", tree };
}
