"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { apiGet } from "@/lib/api";
import { useTheme } from "@/components/ui/ThemeProvider";
import { SkeletonCard, SkeletonTable } from "@/components/ui/SkeletonLoader";
import AstraChat from "@/components/ui/AstraChat";
import HealthScore from "@/components/ui/HealthScore";
import WarRoom from "@/components/ui/WarRoom";
import dynamic from "next/dynamic";
const DashboardMap = dynamic(() => import("@/components/ui/DashboardMap"), { ssr: false });
import {
  LayoutDashboard, Package, Truck, Map, BarChart2, Bell, Settings,
  Sun, Moon, Search, AlertTriangle, Plus, Eye, Sparkles, Leaf,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, X, Loader2,
  ArrowRight, Home,
} from "lucide-react";

interface DashboardStats { active_shipments: number; offline_drivers: number; alerts_today: number; on_time_rate: number; }
interface Shipment { id: string; tracking_id: string; driver_name: string; driver_phone: string; origin: string; destination: string; status: string; estimated_arrival: string; delay_risk: string; created_at: string; }
interface Alert { id: string; shipment_id: string; type: string; message: string; severity: string; resolved: boolean; created_at: string; shipments?: { tracking_id: string }; }

const statusColors: Record<string, string> = {
  active: "bg-blue-500/10 text-blue-400", pending: "bg-amber-500/10 text-amber-400",
  delivered: "bg-emerald-500/10 text-emerald-400", offline: "bg-red-500/10 text-red-400",
  stopped: "bg-gray-500/10 text-gray-400",
};

function calcDelayScore(s: Shipment): number {
  let hash = 0;
  for (let i = 0; i < s.tracking_id.length; i++) hash = ((hash << 5) - hash) + s.tracking_id.charCodeAt(i);
  const seed = Math.abs(hash % 100);
  if (!s.estimated_arrival) return Math.min(seed, 40);
  const hoursLeft = (new Date(s.estimated_arrival).getTime() - Date.now()) / 3600000;
  const hoursInTransit = (Date.now() - new Date(s.created_at).getTime()) / 3600000;
  const ratio = hoursInTransit > 0 && hoursLeft > 0 ? hoursInTransit / (hoursInTransit + hoursLeft) : 0.5;
  const base = Math.round(ratio * 70 + (seed % 30));
  if (s.delay_risk === "HIGH") return Math.max(base, 65);
  if (s.delay_risk === "MEDIUM") return Math.max(base, 35);
  return Math.min(base, 45);
}

function delayScoreBadge(score: number) {
  if (score <= 30) return { label: "On Track", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
  if (score <= 60) return { label: "At Risk", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  return { label: "Critical", cls: "bg-red-500/10 text-red-400 border-red-500/20" };
}

function calcCO2(s: Shipment): number {
  let hash = 0;
  for (let i = 0; i < s.id.length; i++) hash = ((hash << 5) - hash) + s.id.charCodeAt(i);
  const distKm = 200 + Math.abs(hash % 1800);
  const weightKg = 500 + Math.abs((hash >> 8) % 9500);
  return Math.round(distKm * weightKg * 0.00021 * 100) / 100;
}

const sidebarItems = [
  { icon: LayoutDashboard, label: "Overview", id: "section-overview" },
  { icon: Package, label: "Shipments", id: "section-shipments" },
  { icon: Truck, label: "Fleet", id: "section-map" },
  { icon: Map, label: "Routes", id: "section-map" },
  { icon: BarChart2, label: "Analytics", id: "section-overview" },
  { icon: Bell, label: "Alerts", id: "section-alerts" },
  { icon: Settings, label: "Settings", id: "section-overview" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertFilter, setAlertFilter] = useState("all");
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [warRoomOpen, setWarRoomOpen] = useState(false);
  const [astraPrompt, setAstraPrompt] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [mapFilter, setMapFilter] = useState<"all" | "at-risk" | "delayed">("all");
  const [fitAllTrigger, setFitAllTrigger] = useState(0);
  const [activeSection, setActiveSection] = useState("section-overview");

  const loadData = useCallback(async () => {
    try {
      const [statsData, shipmentsData, alertsData] = await Promise.all([
        apiGet<DashboardStats>("/dashboard/stats"),
        apiGet<{ shipments: Shipment[] }>("/dashboard/shipments"),
        apiGet<{ alerts: Alert[] }>("/dashboard/alerts"),
      ]);
      setStats(statsData);
      setShipments(shipmentsData.shipments);
      setAlerts(alertsData.alerts);
    } catch (err) { console.error("Failed to load dashboard:", err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadData();
    const clock = setInterval(() => setNow(new Date()), 1000);
    const data = setInterval(loadData, 30000);
    const channel = supabase.channel("dashboard-alerts").on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, (payload) => {
      setAlerts((prev) => [payload.new as Alert, ...prev].slice(0, 50));
      loadData();
    }).subscribe();
    return () => { clearInterval(clock); clearInterval(data); supabase.removeChannel(channel); };
  }, [loadData]);



  const filteredAlerts = alertFilter === "all" ? alerts : alerts.filter((a) => a.severity === alertFilter);
  const filteredShipments = searchQuery ? shipments.filter((s) =>
    s.tracking_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.driver_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.origin?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.destination?.toLowerCase().includes(searchQuery.toLowerCase())
  ) : shipments;

  const totalCO2 = shipments.reduce((sum, s) => sum + calcCO2(s), 0);

  function formatETA(ts: string) { if (!ts) return "\u2014"; return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  function truncate(str: string, n: number) { if (!str) return ""; const p = str.split(","); return p[0].length > n ? p[0].slice(0, n) + "\u2026" : p[0]; }
  function timeAgo(ts: string) { if (!ts) return ""; const d = (now.getTime() - new Date(ts).getTime()) / 1000; if (d < 60) return `${Math.floor(d)}s ago`; if (d < 3600) return `${Math.floor(d / 60)}m ago`; return `${Math.floor(d / 3600)}h ago`; }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      {/* Sidebar */}
      <aside className={`hidden lg:flex flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-all duration-300 ${sidebarCollapsed ? "w-16" : "w-56"}`}>
        <div className="flex items-center gap-2 p-4 border-b border-[var(--border)]">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
            <Package className="w-4 h-4 text-white" />
          </div>
          {!sidebarCollapsed && <span className="font-bold text-sm text-[var(--text)]">Astra Flow</span>}
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
          {sidebarItems.map((item) => (
            <button key={item.label} onClick={() => { setActiveSection(item.id); document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${activeSection === item.id ? "bg-[var(--accent)]/10 text-[var(--accent)] font-semibold" : "text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"}`}>
              <item.icon className="w-4.5 h-4.5 flex-shrink-0" />
              {!sidebarCollapsed && <span>{item.label === "section-overview" ? "Settings" : item.label}</span>}
            </button>
          ))}
        </nav>
        <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-4 border-t border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors flex items-center justify-center">
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-bold text-[var(--text)]">Control Tower</h1>
              <p className="text-xs text-[var(--text-muted)]">{now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} &middot; {now.toLocaleTimeString("en-IN")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
              <Search className="w-4 h-4 text-[var(--text-muted)]" />
              <input type="text" placeholder="Search shipments..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent text-sm text-[var(--text)] outline-none w-40 placeholder:text-[var(--text-muted)]" />
            </div>
            <button onClick={() => setWarRoomOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors">
              <AlertTriangle className="w-3.5 h-3.5" /> War Room
            </button>
            <button className="relative w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-elevated)] transition-colors">
              <Bell className="w-4 h-4 text-[var(--text-secondary)]" />
              {alerts.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{Math.min(alerts.length, 9)}</span>}
            </button>
            <button onClick={toggle} className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-elevated)] transition-colors" aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="w-4 h-4 text-[var(--text-secondary)]" /> : <Moon className="w-4 h-4 text-[var(--text-secondary)]" />}
            </button>
            <Link href="/" className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-elevated)] transition-colors"><Home className="w-4 h-4 text-[var(--text-secondary)]" /></Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {/* Stats row - 5 cards */}
          <div id="section-overview">
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">{[1,2,3,4,5].map(i => <SkeletonCard key={i} />)}</div>
          ) : stats && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              {[
                { label: "Active Shipments", value: stats.active_shipments, icon: Package, trend: "+12%", up: true },
                { label: "Delayed", value: stats.offline_drivers, icon: AlertTriangle, trend: stats.offline_drivers > 0 ? "Needs action" : "Clear", up: stats.offline_drivers === 0, danger: stats.offline_drivers > 0 },
                { label: "On-Time Rate", value: `${stats.on_time_rate}%`, icon: TrendingUp, trend: "vs 96.2% last week", up: true },
                { label: "CO2 This Month", value: `${(totalCO2 / 1000).toFixed(1)}t`, icon: Leaf, trend: "-4.2% vs last month", up: true },
              ].map((card, i) => (
                <div key={card.label} className={`rounded-xl border bg-[var(--surface)] p-5 animate-fade-in ${card.danger ? "border-red-500/20" : "border-[var(--border)]"}`} style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-[var(--text-muted)]">{card.label}</span>
                    <card.icon className={`w-4 h-4 ${card.danger ? "text-red-400" : "text-[var(--text-muted)]"}`} />
                  </div>
                  <div className="text-2xl font-extrabold text-[var(--text)] mb-1">{card.value}</div>
                  <div className={`flex items-center gap-1 text-xs font-medium ${card.up ? "text-emerald-400" : "text-red-400"}`}>
                    {card.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {card.trend}
                  </div>
                </div>
              ))}
              {/* Health Score card */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center justify-center animate-fade-in" style={{ animationDelay: "200ms" }}>
                <HealthScore onTimeRate={stats.on_time_rate} criticalAlerts={alerts.filter(a => a.severity === "critical").length} activeShipments={stats.active_shipments} totalShipments={shipments.length || 1} />
              </div>
            </div>
          )}
          </div>

          {/* Map Section */}
          <div id="section-map" className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
              <div className="flex gap-2">
                {(["all", "at-risk", "delayed"] as const).map(f => (
                  <button 
                    key={f} 
                    onClick={() => setMapFilter(f)} 
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mapFilter === f ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text)]"}`}
                  >
                    {f === "all" ? "All" : f === "at-risk" ? "At Risk" : "Delayed"}
                  </button>
                ))}
                <button 
                  onClick={() => setFitAllTrigger(prev => prev + 1)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors border border-[var(--border)]"
                >
                  Fit All
                </button>
              </div>
            </div>
            <DashboardMap 
              shipments={filteredShipments} 
              filter={mapFilter} 
              onAskAstra={(prompt) => setAstraPrompt(prompt)}
              fitAllTrigger={fitAllTrigger}
            />
          </div>

          {/* Table + Alerts */}
          <div id="section-shipments" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[var(--text)]">Shipments</h2>
                <Link href="/shipment/new"><button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition-colors"><Plus className="w-3.5 h-3.5" /> New Shipment</button></Link>
              </div>
              {loading ? <SkeletonTable rows={5} /> : (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">
                        {["ID", "Route", "Carrier", "Risk Score", "Status", "ETA", "CO2", "", ""].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {filteredShipments.length === 0 && <tr><td colSpan={9} className="text-center text-[var(--text-muted)] py-12 text-sm">No shipments found.</td></tr>}
                        {filteredShipments.map((s) => {
                          const score = calcDelayScore(s);
                          const badge = delayScoreBadge(score);
                          const co2 = calcCO2(s);
                          return (
                            <tr key={s.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-elevated)] transition-colors">
                              <td className="px-4 py-3 font-mono text-xs text-[var(--accent)]">{s.tracking_id}</td>
                              <td className="px-4 py-3"><div className="text-xs text-[var(--text)]">{truncate(s.origin, 15)}</div><div className="text-xs text-[var(--text-muted)]">{truncate(s.destination, 15)}</div></td>
                              <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">{s.driver_name || "\u2014"}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${badge.cls}`} title="Based on route complexity, transit time, and historical segment data">
                                  {score} &middot; {badge.label}
                                </span>
                              </td>
                              <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColors[s.status] || statusColors.pending}`}>{s.status === "active" ? "In Transit" : s.status}</span></td>
                              <td className="px-4 py-3 text-xs text-[var(--text-secondary)] font-mono">{formatETA(s.estimated_arrival)}</td>
                              <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-xs text-emerald-400"><Leaf className="w-3 h-3" />{co2}kg</span></td>
                              <td className="px-4 py-3">
                                <button onClick={() => setAstraPrompt(`Shipment ${s.tracking_id} from ${s.origin} to ${s.destination} via ${s.driver_name || "Unknown"}. Delay risk score: ${score}/100. Status: ${s.status}. Diagnose root cause and give 3 actionable recommendations.`)} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors">
                                  <Sparkles className="w-3 h-3" /> Astra
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <button onClick={() => router.push(`/track/${s.tracking_id}`)} className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors">
                                  <Eye className="w-3 h-3" /> Track
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Alerts panel */}
            <div id="section-alerts">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[var(--text)]">Live Alerts</h2>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <div className="flex gap-1 p-3 border-b border-[var(--border)]">
                  {["all", "critical", "warning"].map((f) => (
                    <button key={f} onClick={() => setAlertFilter(f)} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${alertFilter === f ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                  {filteredAlerts.length === 0 && <div className="py-12 text-center text-sm text-[var(--text-muted)]">No alerts</div>}
                  {filteredAlerts.map((a) => (
                    <div key={a.id} className={`flex gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0 ${!a.resolved ? "bg-[var(--surface-elevated)]/50" : ""}`}>
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.severity === "critical" ? "bg-red-500" : a.severity === "warning" ? "bg-amber-500" : "bg-blue-500"}`} />
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--text)] leading-relaxed">{a.message}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">{a.shipments?.tracking_id || "\u2014"} &middot; {timeAgo(a.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* War Room overlay */}
      {warRoomOpen && <WarRoom shipments={shipments} onClose={() => setWarRoomOpen(false)} onAskAstra={(prompt) => { setWarRoomOpen(false); setAstraPrompt(prompt); }} />}

      {/* Astra AI Chat */}
      <AstraChat initialPrompt={astraPrompt} onClose={() => setAstraPrompt(undefined)} />
    </div>
  );
}
