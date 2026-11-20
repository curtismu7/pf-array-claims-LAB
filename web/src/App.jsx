import React, { useEffect, useRef, useState } from "react";
import TopMenu from "./top-menu/TopMenu.jsx";
import ShelfLink from "./components/ShelfLink.jsx";
import HelpDialog from "./help-dialog/HelpDialog.jsx";
import TalkTrackDialog from "./talk-track/TalkTrackDialog.jsx";
import { HELP_SECTIONS } from "./helpContent.js";
import { TALK_TRACK } from "./talkTrack.js";
import "./top-menu/top-menu.css";
import SimulationBanner from "./Banner.jsx";
import MintPanel from "./MintPanel.jsx";
import FlowSim from "./FlowSim.jsx";
import ScenarioPicker from "./ScenarioPicker.jsx";
import { SetupGuide, IsIsNot } from "./Guide.jsx";
import { useApi, postJson, workspaceHeaders } from "./api.js";

// The version the header shows: package.json's, fixed at build time (vite.config.js).
const LAB_VERSION = typeof __LAB_VERSION__ === "string" ? __LAB_VERSION__ : null;

// Presenter mode (rule 3): shows the line to say for the active scenario while presenting.
function presenterSay(active) {
  return active ? `${active.label}: ${active.expectNote}` : "Pick a scenario and press Simulate. Start with case 2: the decoy over-grant.";
}

export default function App() {
  const [reloadKey, setReloadKey] = useState(0);
  const [pack, setPack] = useState(null);
  const catalog = useApi("/api/catalog", [reloadKey]);
  const info = useApi("/api/info", [reloadKey]);
  const [source, setSource] = useState("mock");
  const [activeScenario, setActiveScenario] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("theme") || "auto"; } catch { return "auto"; }
  });
  const [presenter, setPresenter] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const SECTIONS = ["flow", "setup", "is"];
  const fromHash = () => (typeof location !== "undefined" && SECTIONS.includes(location.hash.slice(1)) ? location.hash.slice(1) : null);
  const [section, setSection] = useState(() => fromHash() || "flow");
  const modeBox = useRef(null);

  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch { /* none */ }
  }, [theme]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && presenter) setPresenter(false);
      if (e.key.toLowerCase() === "p" && e.altKey) setPresenter((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenter]);

  useEffect(() => {
    const onHash = () => setSection((s) => fromHash() || s);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (info.data) setSource(info.data.source);
  }, [info.data]);

  const realOff = info.data ? info.data.realAvailable === false : false;
  useEffect(() => {
    const select = modeBox.current && modeBox.current.querySelector('[data-testid="mode-select"]');
    if (!select) return undefined;
    if (realOff) select.setAttribute("aria-describedby", "real-reason");
    else select.removeAttribute("aria-describedby");
    return () => select.removeAttribute("aria-describedby");
  }, [realOff]);

  const switchMode = async (target) => {
    const r = await postJson("/api/mode", { source: target });
    if (r.status === 200) {
      setSource(r.body.source);
      setReloadKey((k) => k + 1);
    }
  };

  const reset = async () => {
    await postJson("/api/reset", {});
    setActiveScenario(null);
    setResetKey((k) => k + 1);
  };

  const data = catalog.data;
  return (
    <div className="app">
      <header className="shell-bar">
        <div className="shell-brand">
          <span className="brand-mark" aria-hidden="true">◆</span>
          PF Array Claims
        </div>
        <nav className="shell-nav" aria-label="Sections">
          <a href="#flow" aria-current={section === "flow" ? "page" : undefined} onClick={() => setSection("flow")}>Tour</a>
          <a href="#setup" aria-current={section === "setup" ? "page" : undefined} onClick={() => setSection("setup")}>The fix</a>
          <a href="#is" aria-current={section === "is" ? "page" : undefined} onClick={() => setSection("is")}>Is / Is not</a>
        </nav>
        <div className="shell-right" ref={modeBox}>
          <TopMenu
            mode={{ value: source === "real" ? "real" : "mock", onChange: (m) => switchMode(m === "real" ? "real" : "mock"), realAvailable: info.data ? info.data.realAvailable !== false : null, realHint: info.data?.realReason || undefined }}
            theme={{ value: theme, onChange: setTheme }}
            present={{ active: presenter, onToggle: () => setPresenter((v) => !v), label: "Presenter (Alt+P)" }}
            talkTrack={{ active: talkOpen, onToggle: () => setTalkOpen((v) => !v) }}
            help={{ onClick: () => setHelpOpen(true), title: "What this lab is, and what is simulated" }}
            version={LAB_VERSION}
            onReset={reset}
            extra={<>
              <label className="speed-control" htmlFor="speed">Speed
                <select id="speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                  <option value={4}>4×</option>
                </select>
              </label>
              {realOff && (
                <span id="real-reason" className="real-reason" data-testid="real-reason">
                  Real is not available in this lab: the claim shapes are re-created with mock tokens; the fix on a real PingFederate is a token-mapping change.
                </span>
              )}
            </>}
          >
            <ShelfLink headers={workspaceHeaders()} />
          </TopMenu>
        </div>
      </header>
      <div className="accent-rule" aria-hidden="true" />
      <main>
        <SimulationBanner source={source} />
        {(catalog.error || info.error) && (
          <div className="error-pane" role="alert" data-testid="load-error">
            <span>The page could not load its data: {catalog.error || info.error}.</span>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
          </div>
        )}
        <section className="card intro" data-testid="intro">
          <h1>The isMemberOf claim shape: string vs array</h1>
          <p>
            A group-entitlement policy on an MCP gateway asks one question: does this token carry the group? The answer depends on the
            <strong> shape of the <code>isMemberOf</code> claim</strong> in the PingFederate-issued access token. A delimited string
            (<code>&quot;[A, B]&quot;</code>) forces the policy to search text — and text search matches decoy names. A real array
            (<code>[&quot;A&quot;, &quot;B&quot;]</code>) gives exact membership. Pick a scenario and press Simulate; the mint panel below shows both shapes on the same user.
          </p>
          {data && <p className="hint">{data.mockNote}</p>}
        </section>
        {presenter && (
          <aside className="presenter-say" data-testid="presenter-say" aria-label="Talk track">
            {presenterSay(activeScenario)}
          </aside>
        )}
        <MintPanel shapes={(data && data.shapes) || []} groups={(data && data.groups) || []} />
        <ScenarioPicker cases={(data && data.cases) || []} scenarios={(data && data.scenarios) || []} active={activeScenario} onSelect={setActiveScenario} />        <FlowSim activeScenario={activeScenario} speed={speed} resetKey={resetKey} />
        <SetupGuide guide={data && data.fix} />
        <IsIsNot panel={data && data.isIsNot} />
      </main>
      <HelpDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} sections={HELP_SECTIONS} />
      <TalkTrackDialog isOpen={talkOpen} onClose={() => setTalkOpen(false)} talk={TALK_TRACK} />
      <footer className="app-footer">
        Tester tier · runs are simulated · mock tokens labelled · the fix on a real PingFederate is a token-mapping change, not re-run here
      </footer>
    </div>
  );
}
