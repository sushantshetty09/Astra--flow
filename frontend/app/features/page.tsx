import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Features — Astra Flow", description: "Real-time GPS, AI disruption detection, weather-aware routing, and a unified control tower." };
const features = [
  { id: "tracking", title: "Real-Time GPS Tracking", icon: "📍", desc: "Every driver, every second. GPS via browser Geolocation API, Socket.IO transport, Supabase storage.", details: ["10-second ping intervals", "Dead reckoning prediction", "Offline ping buffering in IndexedDB", "Visual distinction between confirmed and predicted positions"] },
  { id: "disruption", title: "AI Disruption Detection", icon: "🧠", desc: "ML models analyze speed, location, and route compliance in real time.", details: ["Speed drop detection", "Route deviation alerts (>500m)", "Geofence breach detection", "Alert severity: LOW → MEDIUM → HIGH → CRITICAL"] },
  { id: "weather", title: "Weather-Aware Routing", icon: "🌦️", desc: "Open-Meteo data overlaid on every route segment with risk scores and ETA adjustments.", details: ["Per-segment weather risk scoring", "Automatic ETA adjustment for rain", "Proactive rerouting for severe weather", "Visual weather overlays on map"] },
  { id: "dashboard", title: "Control Tower Dashboard", icon: "📡", desc: "Unified real-time view — WebSocket-powered, no page refresh needed.", details: ["Real-time driver markers", "Risk-scored driver table with live search", "Alert feed with severity color coding", "System health monitoring"] },
];
export default function FeaturesPage() {
  const otherFeatures = features.slice(1);

  return (
    <>
      <Navbar />
      <main className="page-shell">
        <section className="section" style={{ borderBottom: "1px solid var(--color-border-base)" }}>
          <div className="container-lg" style={{ textAlign: "center" }}>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800, marginBottom: 20 }}>Everything Your Operations Team Needs</h1>
            <p style={{ color: "var(--color-text-secondary)", fontSize: 18, maxWidth: 600, margin: "0 auto" }}>Integrated capabilities that transform reactive logistics into proactive intelligence.</p>
          </div>
        </section>

        <div className="container-lg" style={{ maxWidth: 1000 }}>
          {/* CUSTOM GPS TRACKING SECTION */}
          <section id="tracking" className="section reveal" style={{ borderBottom: "1px solid var(--color-border-base)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }} className="feat-cols">
              <div>
                <div className="gps-icon-wrapper">
                  📍
                  <div className="gps-pulse-ring"></div>
                </div>
                <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Real-Time GPS Tracking</h2>
                <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.7, fontSize: 15, marginBottom: 32 }}>
                  Every driver, every second. High-precision live location updates utilizing native web APIs and advanced predictive algorithms to ensure you never lose sight of a shipment.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="gps-feature-pill">
                    <span className="gps-feature-pill-icon">🌐</span>
                    <div className="gps-feature-pill-content">
                      <span className="gps-feature-pill-name">Browser Geolocation API</span>
                      <span className="gps-feature-pill-desc">Built-in, no key needed</span>
                    </div>
                  </div>
                  <div className="gps-feature-pill">
                    <span className="gps-feature-pill-icon">⚡</span>
                    <div className="gps-feature-pill-content">
                      <span className="gps-feature-pill-name">Socket.IO</span>
                      <span className="gps-feature-pill-desc">Realtime transport</span>
                    </div>
                  </div>
                  <div className="gps-feature-pill">
                    <span className="gps-feature-pill-icon">🐘</span>
                    <div className="gps-feature-pill-content">
                      <span className="gps-feature-pill-name">Supabase + PostGIS</span>
                      <span className="gps-feature-pill-desc">Location storage, 500MB free</span>
                    </div>
                  </div>
                  <div className="gps-feature-pill">
                    <span className="gps-feature-pill-icon">💾</span>
                    <div className="gps-feature-pill-content">
                      <span className="gps-feature-pill-name">IndexedDB</span>
                      <span className="gps-feature-pill-desc">Offline ping buffering, built-in</span>
                    </div>
                  </div>
                  <div className="gps-feature-pill">
                    <span className="gps-feature-pill-icon">🧮</span>
                    <div className="gps-feature-pill-content">
                      <span className="gps-feature-pill-name">Kalman Filter</span>
                      <span className="gps-feature-pill-desc">Dead reckoning in pure JS</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card-flat" style={{ position: "sticky", top: 120 }}>
                <div style={{ fontFamily: "var(--font-data)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-muted)", marginBottom: 16 }}>Key Capabilities</div>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                  <li style={{ display: "flex", gap: 12, fontSize: 14, color: "var(--color-text-secondary)" }}><span style={{ color: "var(--color-primary)", fontWeight: 700 }}>→</span><span>10-second ping intervals</span></li>
                  <li style={{ display: "flex", gap: 12, fontSize: 14, color: "var(--color-text-secondary)" }}><span style={{ color: "var(--color-primary)", fontWeight: 700 }}>→</span><span>Dead reckoning prediction</span></li>
                  <li style={{ display: "flex", gap: 12, fontSize: 14, color: "var(--color-text-secondary)" }}><span style={{ color: "var(--color-primary)", fontWeight: 700 }}>→</span><span>Offline ping buffering in IndexedDB</span></li>
                  <li style={{ display: "flex", gap: 12, fontSize: 14, color: "var(--color-text-secondary)" }}><span style={{ color: "var(--color-primary)", fontWeight: 700 }}>→</span><span>Visual distinction for predicted positions</span></li>
                </ul>
              </div>
            </div>
          </section>

          {/* DYNAMIC REMAINING SECTIONS */}
          {otherFeatures.map((f, i) => (
            <section key={f.id} id={f.id} className="section reveal" style={{ borderBottom: i < otherFeatures.length - 1 ? "1px solid var(--color-border-base)" : "none" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }} className="feat-cols">
                <div><div style={{ fontSize: 40, marginBottom: 16 }}>{f.icon}</div><h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 700, marginBottom: 16 }}>{f.title}</h2><p style={{ color: "var(--color-text-secondary)", lineHeight: 1.7, fontSize: 15 }}>{f.desc}</p></div>
                <div className="card-flat"><div style={{ fontFamily: "var(--font-data)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-muted)", marginBottom: 16 }}>Key Capabilities</div>
                  <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                    {f.details.map((d, j) => (<li key={j} style={{ display: "flex", gap: 12, fontSize: 14, color: "var(--color-text-secondary)" }}><span style={{ color: "var(--color-primary)", fontWeight: 700 }}>→</span><span>{d}</span></li>))}
                  </ul>
                </div>
              </div>
            </section>
          ))}
        </div>
        <style>{`@media(max-width:768px){.feat-cols{grid-template-columns:1fr !important;}}`}</style>
      </main>
      <Footer />
    </>
  );
}
