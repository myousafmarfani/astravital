import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, AlertTriangle, BookOpen, CheckCircle2, CircleGauge, ClipboardList, CloudOff, Menu, Moon, Plus, Radio, Shield, Siren, Sun, Wifi } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./styles.css";
import { regionContent, type BodyView } from "./bodyExplorer";

const API = "http://localhost:8000/api/v1";
type Observation = { id: string; indicator: string; value: number; secondary_value?: number; unit: string; measured_at: string; source?: string; quality?: string; is_synthetic: boolean };
type Baseline = { indicator: string; value: number; unit: string; verified?: boolean };
type Alert = { id: string; indicator: string; severity: string; title: string; explanation: string; observed_value: string; baseline_value?: string; acknowledged: boolean };
type Hazard = { id: string; title: string; summary: string; source: string; url: string };
type Protocol = { id: string; title: string; category: string; version: string; status: string; applicability: string; content: string[]; simulated: boolean };
type Incident = { id: string; category: string; affected_person: string; status: string; created_at: string; local_notification_status: string; ground_status: string };
type Workflow = { incident: Incident; protocol: { title: string; version: string; status: string }; steps: { id: string; instruction: string; why: string; required: boolean; progress?: { status: string } }[]; offline: boolean; demonstration_only: boolean };
type Section = "Home" | "Health Check" | "My Health" | "Health Guide" | "Emergency Help";

const labels: Record<string, string> = { heart_rate: "Heart rate", blood_pressure: "Blood pressure", blood_glucose: "Blood glucose", temperature: "Temperature", sleep: "Sleep", mood: "Mood" };
const units: Record<string, string> = { heart_rate: "bpm", blood_pressure: "mmHg", blood_glucose: "mg/dL", temperature: "°C", sleep: "hours", mood: "score" };
const navItems: Section[] = ["Home", "Health Check", "My Health", "Health Guide", "Emergency Help"];
const authToken = () => localStorage.getItem("astravital-token");
const astronautId = () => localStorage.getItem("astravital-astronaut-id") || "";
const authUser = () => JSON.parse(localStorage.getItem("astravital-user") || "{\"display_name\":\"Crew member\",\"email\":\"\"}") as { display_name: string; email: string };

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { headers: authToken() ? { Authorization: `Bearer ${authToken()}` } : {} });
  if (response.status === 401) { localStorage.clear(); window.location.reload(); }
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(authToken() ? { Authorization: `Bearer ${authToken()}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 401) { localStorage.clear(); window.location.reload(); }
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function App() {
  return authToken() ? <Workspace /> : <AuthScreen />;
}

function Workspace() {
  const [section, setSection] = useState<Section>("Home");
  const [theme, setTheme] = useState<"dark" | "light">(() => localStorage.getItem("astravital-theme") === "light" ? "light" : "dark");
  const [selected, setSelected] = useState("heart_rate");
  const [observations, setObservations] = useState<Observation[]>([]);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      setError("");
      const [records, refs, notifications] = await Promise.all([
        get<Observation[]>(`/observations?astronaut_id=${astronautId()}`),
        get<Baseline[]>(`/baselines?astronaut_id=${astronautId()}`),
        get<Alert[]>(`/alerts?astronaut_id=${astronautId()}`),
      ]);
      setObservations(records);
      setBaselines(refs);
      setAlerts(notifications);
    } catch {
      setError("Backend unavailable. Existing data remains visible when loaded.");
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("astravital-theme", theme);
  }, [theme]);

  useEffect(() => {
    refresh();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const pending = Number(localStorage.getItem("astravital-pending") || 0);
  const unreadAlerts = alerts.filter((alert) => !alert.acknowledged).length;
  const iconFor = (item: Section) => item === "Home" ? <CircleGauge size={17} /> : item === "Health Check" ? <ClipboardList size={17} /> : item === "Emergency Help" ? <Siren size={17} /> : item === "Health Guide" ? <BookOpen size={17} /> : <Activity size={17} />;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Radio size={20} /></div><div><strong>AstraVital</strong><small>MISSION HEALTH INTELLIGENCE</small></div></div>
      <div className="demo-banner private-banner">PRIVATE WORKSPACE<span>Your records only</span></div>
      <nav aria-label="Primary navigation">{navItems.map((item) => <button className={section === item ? "active" : ""} onClick={() => setSection(item)} key={item}><span>{iconFor(item)}</span>{item}{item === "Home" && unreadAlerts > 0 && <b>{unreadAlerts}</b>}</button>)}</nav>
      <div className="sidebar-foot"><Shield size={16} />Research prototype<br /><span>Not a medical device</span></div>
    </aside>
    <main>
      <header><div className="mobile-title"><Menu size={20} />AstraVital</div><div className="connection">{online ? <Wifi size={15} /> : <CloudOff size={15} />} {online ? "Connected" : "Offline"} {pending > 0 && <span className="pending">{pending} pending</span>}</div><button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}{theme === "dark" ? "Light mode" : "Dark mode"}</button><button className="emergency-entry" onClick={() => setSection("Emergency Help")}><Siren size={15} /> Emergency</button><div className="profile"><div className="avatar">{authUser().display_name.slice(0, 2).toUpperCase()}</div><div><strong>{authUser().display_name}</strong><small>{authUser().email}</small></div></div><button className="logout" onClick={() => { localStorage.clear(); window.location.reload(); }}>Sign out</button></header>
      <section className="content">
        {error && <div className="error">{error}</div>}
        {section === "Home" && <Dashboard observations={observations} baselines={baselines} alerts={alerts} setSelected={setSelected} onNavigate={setSection} />}
        {section === "Health Check" && <Assessment onSaved={refresh} />}
        {section === "My Health" && <MyHealth observations={observations} baselines={baselines} selected={selected} setSelected={setSelected} onRecord={() => setShowForm(true)} />}
        {section === "Health Guide" && <HealthGuide />}
        {section === "Emergency Help" && <EmergencyHelp />}
      </section>
    </main>
    {showForm && <MeasurementForm onClose={() => setShowForm(false)} onSaved={refresh} />}
  </div>;
}

function AuthScreen() {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [form, setForm] = useState({ email: "", password: "", display_name: "", mission: "", environment: "Spacecraft" });
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Unable to authenticate");
      localStorage.setItem("astravital-token", data.token);
      localStorage.setItem("astravital-astronaut-id", data.astronaut_id);
      localStorage.setItem("astravital-user", JSON.stringify(data.user));
      window.location.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to authenticate"); }
  };
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <main className="auth-page"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><Radio size={20} /></div><div><strong>AstraVital</strong><small>CREW HEALTH WORKSPACE</small></div></div><p className="eyebrow">{mode === "register" ? "NEW CREW MEMBER" : "CREW ACCESS"}</p><h1>{mode === "register" ? "Create your account" : "Welcome back"}</h1><p className="muted">{mode === "register" ? "Start with an empty personal health workspace. You control what gets recorded." : "Sign in to your private mission health workspace."}</p><form onSubmit={submit}>{mode === "register" && <><label>Display name<input required value={form.display_name} onChange={(event) => update("display_name", event.target.value)} placeholder="e.g. Alex Morgan" /></label><label>Mission<input value={form.mission} onChange={(event) => update("mission", event.target.value)} placeholder="Mission name (optional)" /></label><label>Mission environment<select value={form.environment} onChange={(event) => update("environment", event.target.value)}><option>Spacecraft</option><option>International space station</option><option>Lunar habitat</option><option>Mars transit spacecraft</option></select></label></>}<label>Email<input required type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="crew@example.test" /></label><label>Password<input required minLength={10} type="password" value={form.password} onChange={(event) => update("password", event.target.value)} placeholder="At least 10 characters" /></label>{error && <div className="error">{error}</div>}<button className="primary full" type="submit">{mode === "register" ? "Create crew account" : "Sign in"}</button></form><button className="auth-switch" onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(""); }}>{mode === "register" ? "Already have an account? Sign in" : "New crew member? Create an account"}</button><small className="source-note">Research prototype ? not a medical device</small></div></main>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{subtitle}</p></div>{action}</div>;
}

function MetricGrid({ observations, baselines, onSelect }: { observations: Observation[]; baselines: Baseline[]; onSelect?: (indicator: string) => void }) {
  const latest = new Map<string, Observation>();
  observations.forEach((item) => { if (!latest.has(item.indicator)) latest.set(item.indicator, item); });
  return <div className="metric-grid">{Object.keys(labels).map((key) => {
    const item = latest.get(key);
    const ref = baselines.find((baseline) => baseline.indicator === key);
    const changed = Boolean(item && ref && Math.abs(item.value - ref.value) / Math.max(ref.value, 1) > .15);
    const state = !item ? "No measurement recorded." : item.quality === "requires_verification" ? "Measurement requires verification." : !ref ? "Personal reference not established." : observations.filter((observation) => observation.indicator === key).length < 2 ? "Insufficient historical data for comparison." : changed ? "Trend requires review." : "Comparable with personal reference.";
    return <button className="metric-card" onClick={() => onSelect?.(key)} key={key}><div className="metric-head"><span>{labels[key]}</span>{item?.quality === "requires_verification" || changed ? <AlertTriangle size={16} className="warn" /> : null}</div><strong>{item ? `${item.value}${key === "blood_pressure" ? `/${item.secondary_value}` : ""}` : "—"}</strong><small>{item?.unit || units[key]}</small><small className={item ? "metric-state" : "metric-state muted"}>{state}</small>{item && <small>{new Date(item.measured_at).toLocaleString()} · {item.is_synthetic ? "Synthetic" : item.source || "Manual"}</small>}</button>;
  })}</div>;
}

function TrendChart({ observations, baselines, selected }: { observations: Observation[]; baselines: Baseline[]; selected: string }) {
  const current = observations.filter((item) => item.indicator === selected).slice(0, 30).reverse();
  const baseline = baselines.find((item) => item.indicator === selected);
  return <section className="panel chart-panel"><div className="panel-heading"><div><h2>{labels[selected]} trend</h2><p>{baseline ? `Personal reference ${baseline.value} ${baseline.unit}` : "Personal reference not established"}</p></div>{current.some((item) => item.is_synthetic) && <span className="tag">SYNTHETIC DATA</span>}</div>{current.length < 2 ? <div className="empty">More measurements are needed to establish a meaningful trend.</div> : <ResponsiveContainer width="100%" height={260}><LineChart data={current}><XAxis dataKey="measured_at" tickFormatter={(value) => value.slice(5, 10)} stroke="#71809a" /><YAxis unit={units[selected]} stroke="#71809a" /><Tooltip /><Line type="monotone" dataKey="value" stroke="#52d6da" strokeWidth={3} dot /></LineChart></ResponsiveContainer>}<div className="chart-note"><span className="legend-line"></span>Observed value {baseline && <><span className="legend-dash"></span>Personal reference</>}</div></section>;
}

function Dashboard({ observations, baselines, alerts, setSelected, onNavigate }: { observations: Observation[]; baselines: Baseline[]; alerts: Alert[]; setSelected: (value: string) => void; onNavigate: (section: Section) => void }) {
  const unread = alerts.filter((alert) => !alert.acknowledged);
  return <><PageHeading eyebrow="HOME" title={`Good to see you, ${authUser().display_name}`} subtitle="Here is the health information currently available for your mission." /><section className="home-actions"><button className="primary" onClick={() => onNavigate("Health Check")}><ClipboardList size={17} /> Start health check</button><button className="secondary" onClick={() => onNavigate("My Health")}>Report a symptom</button><button className="emergency-entry" onClick={() => onNavigate("Emergency Help")}><Siren size={15} /> Emergency help</button></section><div className="status-strip"><div><span className="status-dot"></span><strong>{observations.length ? "Records available" : "No measurements yet"}</strong><small>{observations.length ? "Review the latest values below" : "Start a health check to begin"}</small></div><div><strong>{unread.length}</strong><small>notifications requiring review</small></div><div><strong>{observations.length}</strong><small>measurements recorded</small></div></div><div className="section-title"><h2>Six primary indicators</h2><span>Missing data is not a health conclusion</span></div><MetricGrid observations={observations} baselines={baselines} onSelect={setSelected} /><section className="panel"><div className="panel-heading"><div><h2>Recent health insights</h2><p>Only recorded signals and incomplete information are shown.</p></div></div><AlertList alerts={unread.slice(0, 3)} /></section>{observations.length === 0 && <div className="empty short">No health measurements are recorded yet. Start Health Check when you are ready.</div>}</>;
}

function MyHealth({ observations, baselines, selected, setSelected, onRecord }: { observations: Observation[]; baselines: Baseline[]; selected: string; setSelected: (value: string) => void; onRecord: () => void }) {
  return <><PageHeading eyebrow="MY HEALTH" title="Your health record" subtitle="Indicators, history, personal references and body explorer" action={<button className="primary" onClick={onRecord}><Plus size={17} /> Record measurement</button>} /><MetricGrid observations={observations} baselines={baselines} onSelect={setSelected} /><div className="health-subsections"><section className="panel"><div className="panel-heading"><div><h2>History and trends</h2><p>Charts appear only when enough observations exist.</p></div></div><div className="indicator-tabs">{Object.keys(labels).map((key) => <button className={selected === key ? "selected" : ""} onClick={() => setSelected(key)} key={key}>{labels[key]}</button>)}</div><TrendChart observations={observations} baselines={baselines} selected={selected} /></section><section className="panel"><div className="panel-heading"><div><h2>Personal references</h2><p>References are not automatically changed by new measurements.</p></div></div>{baselines.length ? baselines.map((baseline) => <div className="reference-row" key={baseline.indicator}><strong>{labels[baseline.indicator]}</strong><span>{baseline.value} {baseline.unit}</span><small>{baseline.verified ? "Verified reference" : "Reference not verified"}</small></div>) : <div className="empty short">Personal references are not established.</div>}</section></div><section className="panel"><div className="panel-heading"><div><h2>Recent observations</h2><p>Timestamped records with source and quality status</p></div></div>{observations.length ? <div className="table-wrap"><table><thead><tr><th>Indicator</th><th>Value</th><th>Measured</th><th>Source</th><th>Quality</th></tr></thead><tbody>{observations.slice(0, 12).map((item) => <tr key={item.id}><td>{labels[item.indicator]}</td><td>{item.value}{item.secondary_value !== undefined ? `/${item.secondary_value}` : ""} {item.unit}</td><td>{new Date(item.measured_at).toLocaleString()}</td><td><span className="source-pill">{item.is_synthetic ? "Synthetic" : item.source || "Manual"}</span></td><td>{item.quality === "requires_verification" ? "Requires verification" : "Recorded"}</td></tr>)}</tbody></table></div> : <div className="empty short">No observations yet. Record your first measurement to begin your personal history.</div>}</section><BodyMap /></>;
}

function Assessment({ onSaved }: { onSaved: () => void }) {
  return <><PageHeading eyebrow="HEALTH CHECK" title="Complete a health check" subtitle="Record what is available today. You can complete the rest later." /><section className="panel assessment-panel"><h2>Step 1 · Daily wellbeing</h2><p className="muted">Use the measurement form below for available indicators. Missing information remains clearly marked.</p><MeasurementFormFields onSaved={onSaved} /></section><section className="panel assessment-panel"><h2>Step 2 · Review and next action</h2><p className="muted">After saving, review the Home and My Health sections for comparison, data quality, and any approved signals.</p></section></>;
}

function AlertList({ alerts }: { alerts: Alert[] }) {
  return alerts.length ? <>{alerts.map((alert) => <div className="alert" key={alert.id}><div className="alert-icon"><AlertTriangle size={17} /></div><div><strong>{alert.title}</strong><p>{alert.explanation}</p><small>Review with qualified medical personnel</small></div></div>)}</> : <div className="empty short"><CheckCircle2 size={24} />No configured flags. This does not confirm health.</div>;
}

function BodyMap() {
  const [view, setView] = useState<BodyView>("front");
  const [selected, setSelected] = useState("chest");
  const [showReport, setShowReport] = useState(false);
  const content = regionContent[selected];
  const regions = view === "front"
    ? [["head", "ellipse", "150,50,31,37"], ["eyes", "ellipse", "150,52,15,8"], ["neck", "rect", "137,83,26,22"], ["chest", "path", "M112 108 Q150 93 188 108 L180 185 Q150 198 120 185 Z"], ["abdomen", "path", "M120 183 Q150 193 180 183 L174 245 Q150 258 126 245 Z"], ["arms", "path", "M115 112 L92 125 L73 205 L86 209 L116 153 Z"], ["arms", "path", "M185 112 L208 125 L227 205 L214 209 L184 153 Z"], ["pelvis", "path", "M126 243 Q150 255 174 243 L184 278 Q150 292 116 278 Z"], ["legs", "path", "M119 275 L146 280 L142 411 L119 411 Z"], ["legs", "path", "M154 280 L181 275 L181 411 L158 411 Z"], ["feet", "ellipse", "116,423,18,8"], ["feet", "ellipse", "184,423,18,8"]]
    : [["head", "ellipse", "150,50,31,37"], ["neck", "rect", "137,83,26,22"], ["back", "path", "M112 108 Q150 93 188 108 L180 245 Q150 258 120 245 Z"], ["arms", "path", "M115 112 L92 125 L73 205 L86 209 L116 153 Z"], ["arms", "path", "M185 112 L208 125 L227 205 L214 209 L184 153 Z"], ["pelvis", "path", "M126 243 Q150 255 174 243 L184 278 Q150 292 116 278 Z"], ["legs", "path", "M119 275 L146 280 L142 411 L119 411 Z"], ["legs", "path", "M154 280 L181 275 L181 411 L158 411 Z"], ["feet", "ellipse", "116,423,18,8"], ["feet", "ellipse", "184,423,18,8"]];
  const regionLabel = (id: string) => regionContent[id].label;
  return <><PageHeading eyebrow="INTERACTIVE HEALTH EXPLORER" title="Body explorer" subtitle="Select a region to explore possible spaceflight-related contributors. This is educational, not a diagnosis." /><div className="explorer-layout"><section className="panel anatomy-panel"><div className="view-switcher"><button className={view === "front" ? "selected" : ""} onClick={() => setView("front")}>Front view</button><button className={view === "back" ? "selected" : ""} onClick={() => setView("back")}>Back view</button></div><div className={`anatomy-stage ${view}`}><svg className="anatomy-svg" viewBox="0 0 300 455" role="img" aria-label={`${view} view of interactive human body`}><defs><linearGradient id="body-skin" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#284761" /><stop offset=".48" stopColor="#19344d" /><stop offset="1" stopColor="#10263c" /></linearGradient><radialGradient id="body-light" cx=".35" cy=".2"><stop stopColor="#7cc9d0" stopOpacity=".22" /><stop offset="1" stopColor="#10263c" stopOpacity="0" /></radialGradient></defs><path className="body-outline" d="M150 14c-19 0-31 16-31 37 0 13 5 23 13 29l-2 17c-8 3-17 8-25 16-8 9-14 21-18 37l-12 49c-2 9 2 17 10 20l5 2 17-52 8-17c-2 39-2 82 2 119l3 31-2 68c0 12 7 19 18 19h8l6-67 6 67h8c11 0 18-7 18-19l-2-68 3-31c4-37 4-80 2-119l8 17 17 52 5-2c8-3 12-11 10-20l-12-49c-4-16-10-28-18-37-8-8-17-13-25-16l-2-17c8-6 13-16 13-29 0-21-12-37-31-37z" fill="url(#body-skin)" /><path className="body-highlight" d="M150 18c-12 0-21 13-21 31 0 12 4 20 11 26 3 2 5 3 10 3s7-1 10-3c7-6 11-14 11-26 0-18-9-31-21-31zM126 109c8-8 16-11 24-11s16 3 24 11c-8 5-16 8-24 8s-16-3-24-8z" /><path className="anatomy-detail" d="M127 139c14 8 32 8 46 0M130 178c12 7 28 7 40 0M132 218c11 6 25 6 36 0M150 110v137M121 283c10 6 20 8 29 8s19-2 29-8M139 294l-3 102M161 294l3 102M109 124c13 10 25 15 41 15s28-5 41-15M124 92c8 7 17 10 26 10s18-3 26-10" /><path className="anatomy-back-detail" d="M122 126c8 13 18 20 28 20s20-7 28-20M129 154c14 8 28 8 42 0M132 191c11 7 25 7 36 0M137 230c9 5 17 5 26 0M150 112v132" />{regions.map(([id, type, shape], index) => { const region = id as string; const props = { key: `${region}-${index}`, className: `anatomy-region ${selected === region ? "selected" : ""}`, tabIndex: 0, role: "button", "aria-label": regionLabel(region), onClick: () => setSelected(region), onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") setSelected(region); } }; if (type === "ellipse") { const [cx, cy, rx, ry] = shape.split(",").map(Number); return <ellipse {...props} cx={cx} cy={cy} rx={rx} ry={ry} />; } if (type === "rect") { const [x, y, width, height] = shape.split(",").map(Number); return <rect {...props} x={x} y={y} width={width} height={height} rx="10" />; } return <path {...props} d={shape} />; })}</svg><div className="anatomy-view-label">{view.toUpperCase()} VIEW</div><div className="anatomy-key"><span></span> Select a highlighted region</div></div></section><RegionDetail content={content} onReport={() => setShowReport(true)} /></div>{showReport && <SymptomReport region={selected} onClose={() => setShowReport(false)} />}</>;
}

function RegionDetail({ content, onReport }: { content: (typeof regionContent)[string]; onReport: () => void }) {
  return <section className="panel region-detail"><div className="detail-kicker">SELECTED BODY REGION</div><h2>{content.label}</h2><p className="detail-disclaimer">Possible explanations for education and symptom context only. Selection does not identify a condition.</p><h3>What might cause discomfort here?</h3>{content.causes.map((cause) => <div className="cause-card" key={cause.title}><strong>{cause.title}</strong><p>{cause.description}</p><small>Potential contributor · {cause.hazard}</small></div>)}<h3>Why does this happen in space?</h3><div className="mechanism"><b>Spaceflight factor</b><p>{content.mechanism}</p></div><h3>Related health indicators</h3><div className="indicator-chips">{content.indicators.map((indicator) => <span key={indicator}>{indicator}</span>)}</div><h3>Relevant hazards</h3><div className="hazard-chips">{content.hazards.map((hazard) => <span key={hazard}>{hazard}</span>)}</div><h3>What should the astronaut do next?</h3><p className="next-step">{content.next}</p><button className="primary full" onClick={onReport}>Report symptom for {content.label}</button><small className="source-note">Scientific context: NASA Human Research Program hazards and risks. Medical review status: educational prototype content.</small></section>;
}

function SymptomReport({ region, onClose }: { region: string; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(false);
  const [form, setForm] = useState({ discomfort_type: "", description: "", started_at: new Date().toISOString().slice(0, 16), duration: "", pattern: "ongoing", trajectory: "unchanged", intensity: "", associated: "", notes: "" });
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent, isDraft = false) => { event.preventDefault(); try { await post("/symptom-reports", { astronaut_id: astronautId(), regions: [region], discomfort_type: form.discomfort_type || "Unspecified discomfort", description: form.description || undefined, started_at: new Date(form.started_at).toISOString(), duration: form.duration || undefined, pattern: form.pattern, trajectory: form.trajectory, intensity: form.intensity ? Number(form.intensity) : undefined, associated_symptoms: form.associated ? form.associated.split(",").map((item) => item.trim()).filter(Boolean) : [], notes: form.notes || undefined, is_draft: isDraft }); setDraft(isDraft); setMessage(isDraft ? "Draft saved to the health record." : "Symptom report saved. Follow the applicable mission medical procedure if needed."); } catch { setMessage("Unable to save. Check the backend connection and try again."); } };
  return <div className="modal-backdrop"><form className="modal symptom-modal" onSubmit={(event) => save(event)}><div className="panel-heading"><div><p className="eyebrow">SYMPTOM REPORT · {regionContent[region].label.toUpperCase()}</p><h2>Record discomfort</h2></div><button type="button" className="close" onClick={onClose}>×</button></div><p className="form-note">This report records context and does not diagnose a medical condition.</p><div className="form-two-col"><label>Type of discomfort<input required={!draft} value={form.discomfort_type} onChange={(event) => update("discomfort_type", event.target.value)} placeholder="e.g. ache, pressure, visual change" /></label><label>When it started<input required={!draft} type="datetime-local" value={form.started_at} onChange={(event) => update("started_at", event.target.value)} /></label><label>Duration<input value={form.duration} onChange={(event) => update("duration", event.target.value)} placeholder="e.g. 20 minutes" /></label><label>Intensity (optional)<input type="number" min="0" max="10" value={form.intensity} onChange={(event) => update("intensity", event.target.value)} placeholder="0–10" /></label><label>Pattern<select value={form.pattern} onChange={(event) => update("pattern", event.target.value)}><option value="ongoing">Ongoing</option><option value="intermittent">Intermittent</option></select></label><label>Trajectory<select value={form.trajectory} onChange={(event) => update("trajectory", event.target.value)}><option value="improving">Improving</option><option value="unchanged">Unchanged</option><option value="worsening">Worsening</option></select></label></div><label>Description<textarea value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="What are you experiencing?" /></label><label>Associated symptoms<textarea value={form.associated} onChange={(event) => update("associated", event.target.value)} placeholder="Separate multiple symptoms with commas" /></label><label>Additional notes<textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>{message && <div className="success">{message}</div>}<div className="form-actions"><button type="button" className="secondary" onClick={(event) => save(event as unknown as React.FormEvent, true)}>Save draft</button><button className="primary" type="submit">Submit report</button></div></form></div>;
}

function Hazards() {
  const [hazards, setHazards] = useState<Hazard[]>([]);
  useEffect(() => { get<Hazard[]>("/hazards").then(setHazards).catch(() => undefined); }, []);
  return <><PageHeading eyebrow="MISSION EDUCATION" title="Spaceflight hazards" subtitle="NASA Human Research Program topics relevant to onboard monitoring" /><div className="hazard-grid">{hazards.map((hazard) => <article className="panel hazard-card" key={hazard.id}><span className="hazard-index">{hazard.id.replace("-", " ").toUpperCase()}</span><h2>{hazard.title}</h2><p>{hazard.summary}</p><a href={hazard.url} target="_blank" rel="noreferrer">Source: {hazard.source} ↗</a></article>)}</div></>;
}

function Guidance() {
  const items = [["Measure consistently", "Use the same approved context and units when possible so personal trends remain interpretable."], ["Review changes", "A deviation signal should be reviewed with qualified medical personnel and understood alongside context."], ["Protect privacy", "This prototype uses fictional synthetic records. Do not enter real health information into the demo environment."]];
  return <><PageHeading eyebrow="HEALTH GUIDANCE" title="Guidance center" subtitle="Plain-language, safety-first reminders for the mission routine" /><div className="guidance-grid">{items.map(([title, text]) => <article className="panel guidance-card" key={title}><CheckCircle2 className="ok" size={20} /><h2>{title}</h2><p>{text}</p><small>Prototype guidance · medical review required before operational use</small></article>)}</div></>;
}

function HealthGuide() {
  return <><PageHeading eyebrow="HEALTH GUIDE" title="Understand your mission environment" subtitle="Educational information about hazards, body systems and practical health improvement." /><Hazards /><Guidance /></>;
}

function EmergencyHelp() {
  const [view, setView] = useState<"help" | "protocols" | "communications">("help");
  return <><PageHeading eyebrow="EMERGENCY HELP" title="Get medical assistance" subtitle="Local emergency resources remain available offline. This prototype does not diagnose or provide treatment instructions." /><div className="subnav"><button className={view === "help" ? "selected" : ""} onClick={() => setView("help")}>Open assistance</button><button className={view === "protocols" ? "selected" : ""} onClick={() => setView("protocols")}>Local protocols</button><button className={view === "communications" ? "selected" : ""} onClick={() => setView("communications")}>Communication status</button></div>{view === "help" && <EmergencyCenter />}{view === "protocols" && <ProtocolLibrary />}{view === "communications" && <Communications />}</>;
}

function EmergencyCenter() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [message, setMessage] = useState("");
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const load = () => get<Incident[]>("/emergency/incidents").then(setIncidents).catch(() => undefined);
  useEffect(() => { load(); }, []);
  const openIncident = async (category: string, affectedPerson = "self") => {
    try { const result = await post<{ incident: Incident }>("/emergency/incidents", { category, affected_person: affectedPerson, notes: "Initiated from local Emergency Response Center." }); const next = await get<Workflow>(`/emergency/incidents/${result.incident.id}/workflow`); setPendingCategory(null); setWorkflow(next); setMessage("Incident recorded locally. Workflow progress is saved locally."); load(); } catch { setMessage("Unable to open the local emergency workflow."); }
  };
  const updateStep = async (stepId: string, status: "completed" | "cannot_complete" | "needs_assistance") => { if (!workflow) return; await post(`/emergency/incidents/${workflow.incident.id}/workflow/${stepId}`, { status }); if (status === "needs_assistance") await post("/communications/queue", { incident_id: workflow.incident.id, recipient_role: "crew_medical_officer", priority: "urgent" }); setWorkflow(await get<Workflow>(`/emergency/incidents/${workflow.incident.id}/workflow`)); };
  const categories = [["difficulty-breathing", "Difficulty breathing"], ["chest-discomfort", "Chest pain or discomfort"], ["severe-injury", "Severe injury or physical incident"], ["bleeding", "Bleeding or wound concern"], ["fainting", "Fainting or loss of consciousness"], ["neurological", "Severe headache or neurological concern"], ["vision", "Eye or vision changes"], ["dizziness", "Dizziness or balance problems"], ["abdominal", "Abdominal or gastrointestinal discomfort"], ["fever", "Suspected infection or fever-related concern"], ["psychological", "Psychological or behavioural health concern"], ["environmental", "Possible environmental exposure"], ["uncertain", "I am not sure what is happening"]];
  return <><div className="emergency-banner"><Siren size={24} /><div><strong>AstraVital Emergency Assistance</strong><span>Select a concern to open local guidance. This prototype contains demonstration-only, non-clinical workflow actions.</span></div></div>{workflow ? <section className="panel workflow-panel"><button className="secondary" onClick={() => setWorkflow(null)}>Back to concerns</button><div className="workflow-meta"><span className="protocol-status">DEMONSTRATION ONLY</span><strong>{workflow.protocol.title}</strong><small>Version {workflow.protocol.version} · {workflow.protocol.status} · Operating offline</small></div><div className="workflow-progress">Progress: {workflow.steps.filter((step) => step.progress?.status === "completed").length} of {workflow.steps.length} completed</div>{workflow.steps.map((step, index) => <article className={`workflow-step ${step.progress?.status === "completed" ? "complete" : ""}`} key={step.id}><small>STEP {index + 1} OF {workflow.steps.length}</small><h2>{step.instruction}</h2><p>{step.why}</p>{step.progress?.status ? <span className="status-pill">{step.progress.status.replace("_", " ")}</span> : <div className="step-actions"><button className="primary" onClick={() => updateStep(step.id, "completed")}>Mark completed</button><button className="secondary" onClick={() => updateStep(step.id, "needs_assistance")}>Request assistance</button><button className="secondary" onClick={() => updateStep(step.id, "cannot_complete")}>Cannot complete</button></div>}</article>)}</section> : <><section className="panel"><div className="panel-heading"><div><h2>{pendingCategory ? "Who is affected?" : "Open emergency assistance"}</h2><p>{pendingCategory ? "Choose the affected person before recording the incident." : "Choose the closest concern. You can proceed when uncertain."}</p></div></div>{pendingCategory ? <div className="emergency-actions"><button onClick={() => openIncident(pendingCategory, "self")}>Current astronaut</button><button onClick={() => openIncident(pendingCategory, "another crew member")}>Another crew member</button><button onClick={() => setPendingCategory(null)}>Back to concerns</button></div> : <div className="emergency-actions">{categories.map(([key, title]) => <button key={key} onClick={() => setPendingCategory(key)}><Siren size={16} />{title}</button>)}</div>}{message && <div className="success">{message}</div>}</section><section className="panel"><div className="panel-heading"><div><h2>Incident history</h2><p>Saved locally with explicit notification and ground status</p></div></div>{incidents.length ? incidents.map((incident) => <button className="incident-row incident-button" key={incident.id} onClick={() => get<Workflow>(`/emergency/incidents/${incident.id}/workflow`).then(setWorkflow)}><div><strong>{incident.category.replace("-", " ")}</strong><small>{new Date(incident.created_at).toLocaleString()} · {incident.status}</small></div><span className="status-pill">{incident.local_notification_status}</span><span className="status-pill muted-pill">{incident.ground_status}</span></button>) : <div className="empty short">No incidents recorded.</div>}</section></>}</>;
}

function ProtocolLibrary() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  useEffect(() => { get<Protocol[]>("/protocols").then(setProtocols).catch(() => undefined); }, []);
  return <><PageHeading eyebrow="LOCAL KNOWLEDGE" title="Mission Medical Protocol Library" subtitle="Locally available content with verification and applicability status" /><div className="protocol-grid">{protocols.map((protocol) => <article className="panel protocol-card" key={protocol.id}><div className="protocol-status">{protocol.status}</div><h2>{protocol.title}</h2><p>{protocol.category} · version {protocol.version}</p><small>{protocol.applicability}</small><ol>{protocol.content.map((step) => <li key={step}>{step}</li>)}</ol><span className="source-note">Demonstration only · not an approved clinical procedure</span></article>)}</div></>;
}

function Communications() {
  const [messages, setMessages] = useState<{ id: string; recipient_role: string; priority: string; status: string; created_at: string }[]>([]);
  const [message, setMessage] = useState("");
  const load = () => get<typeof messages>("/communications/outbox").then(setMessages).catch(() => undefined);
  useEffect(() => { get<typeof messages>("/communications/outbox").then(setMessages).catch(() => undefined); }, []);
  const queue = async () => { try { await post("/communications/queue", { recipient_role: "flight_surgeon", priority: "routine" }); setMessage("Message queued locally. No ground transmission is claimed."); load(); } catch { setMessage("Unable to queue message."); } };
  return <><PageHeading eyebrow="STORE AND FORWARD" title="Medical Communications" subtitle="Asynchronous outbox with explicit simulated transmission states" action={<button className="primary" onClick={queue}>Queue summary</button>} />{message && <div className="success">{message}</div>}<section className="panel">{messages.length ? messages.map((item) => <div className="incident-row" key={item.id}><div><strong>{item.recipient_role}</strong><small>{new Date(item.created_at).toLocaleString()} · {item.priority}</small></div><span className="status-pill">{item.status}</span></div>) : <div className="empty short">Outbox is empty.</div>}</section></>;
}

function MeasurementFormFields({ onSaved }: { onSaved: () => void }) {
  const [indicator, setIndicator] = useState("heart_rate");
  const [value, setValue] = useState("");
  const [secondary, setSecondary] = useState("");
  const [message, setMessage] = useState("");
  const save = async (event: React.FormEvent) => { event.preventDefault(); try { await post("/observations", { astronaut_id: astronautId(), indicator, value: Number(value), secondary_value: secondary ? Number(secondary) : undefined, unit: units[indicator], measured_at: new Date().toISOString(), source: "manual", is_synthetic: false }); setMessage("Saved to the mission record."); onSaved(); } catch { setMessage("Could not save. Check the value and backend connection."); } };
  return <form onSubmit={save}><label>Indicator<select value={indicator} onChange={(event) => setIndicator(event.target.value)}>{Object.entries(labels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>Value<input required type="number" step="any" min="0" value={value} onChange={(event) => setValue(event.target.value)} placeholder={`Enter value in ${units[indicator]}`} /></label>{indicator === "blood_pressure" && <label>Diastolic value<input required type="number" min="0" value={secondary} onChange={(event) => setSecondary(event.target.value)} placeholder="e.g. 72" /></label>}<p className="form-note">Your entry is validated, timestamped, and compared only with this astronaut's configured reference. It is not a diagnosis.</p>{message && <div className="success">{message}</div>}<button className="primary full" type="submit">Save observation</button></form>;
}

function MeasurementForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  return <div className="modal-backdrop"><div className="modal"><div className="panel-heading"><div><p className="eyebrow">NEW OBSERVATION</p><h2>Record measurement</h2></div><button type="button" className="close" onClick={onClose}>×</button></div><MeasurementFormFields onSaved={() => { onSaved(); onClose(); }} /></div></div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
