"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import { Sparkles, Navigation, Radio } from "lucide-react";

// Fix default Leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/marker-icon-2x.png",
  iconUrl: "/marker-icon.png",
  shadowUrl: "/marker-shadow.png",
});

// ── Types ──
interface Shipment {
  id: string; tracking_id: string; origin: string; destination: string;
  status: string; driver_name: string; estimated_arrival: string;
  delay_risk?: string; coords?: [number, number]; eta?: string;
}

interface DriverState {
  id: string; shipment: Shipment;
  currentPos: [number, number]; routeCoords: [number, number][];
  traveledCoords: [number, number][]; routeIndex: number;
  speed: number; etaMinutes: number; distLeftKm: number;
  rerouted: boolean; rerouteTime: number;
  marker: L.Marker | null; routeLine: L.Polyline | null;
  traveledLine: L.Polyline | null; rerouteLine: L.Polyline | null;
}

interface DashboardMapProps {
  shipments: Shipment[];
  filter: "all" | "at-risk" | "delayed";
  onAskAstra: (prompt: string) => void;
  fitAllTrigger: number;
}

// ── Constants ──
const DEMO_SHIPMENTS: Shipment[] = [
  { id:"AF-001", tracking_id:"AF-001", origin:"Mumbai", destination:"Delhi", coords:[19.076,72.877], status:"delayed", driver_name:"Rajan K", eta:"2h overdue", estimated_arrival:"" },
  { id:"AF-002", tracking_id:"AF-002", origin:"Bengaluru", destination:"Chennai", coords:[12.971,77.594], status:"active", driver_name:"Suresh M", eta:"On time", estimated_arrival:"" },
  { id:"AF-003", tracking_id:"AF-003", origin:"Kolkata", destination:"Hyderabad", coords:[22.572,88.363], status:"pending", driver_name:"Amit P", eta:"45min delay", estimated_arrival:"" },
  { id:"AF-004", tracking_id:"AF-004", origin:"Pune", destination:"Ahmedabad", coords:[18.520,73.856], status:"delayed", driver_name:"Vikram S", eta:"3h overdue", estimated_arrival:"" },
  { id:"AF-005", tracking_id:"AF-005", origin:"Jaipur", destination:"Lucknow", coords:[26.912,75.787], status:"active", driver_name:"Deepak R", eta:"On time", estimated_arrival:"" },
  { id:"AF-006", tracking_id:"AF-006", origin:"Surat", destination:"Nagpur", coords:[21.170,72.831], status:"pending", driver_name:"Kiran B", eta:"1h delay", estimated_arrival:"" },
];

const DEST_COORDS: Record<string, [number, number]> = {
  Delhi:[28.7041,77.1025], Chennai:[13.0827,80.2707], Hyderabad:[17.385,78.4867],
  Ahmedabad:[23.0225,72.5714], Lucknow:[26.8467,80.9462], Nagpur:[21.1458,79.0882],
  Mumbai:[19.076,72.877], Bengaluru:[12.9716,77.5946], Kolkata:[22.5726,88.3639],
  Pune:[18.5204,73.8567], Jaipur:[26.9124,75.7873], Surat:[21.1702,72.8311],
};

const HEATZONES = [
  { name:"Delhi", coords:[28.7041,77.1025] as [number,number] },
  { name:"Mumbai", coords:[19.076,72.877] as [number,number] },
  { name:"Chennai", coords:[13.0827,80.2707] as [number,number] },
  { name:"Kolkata", coords:[22.5726,88.3639] as [number,number] },
  { name:"Hyderabad", coords:[17.385,78.4867] as [number,number] },
];

const CORRIDORS: [number,number][][] = [
  [[19.076,72.877],[28.7041,77.1025]], [[12.9716,77.5946],[13.0827,80.2707]],
  [[22.5726,88.3639],[17.385,78.4867]], [[28.7041,77.1025],[18.5204,73.8567]],
];

// ── Helpers ──
function haversine(a:[number,number], b:[number,number]): number {
  const R = 6371;
  const dLat = (b[0]-a[0]) * Math.PI/180;
  const dLng = (b[1]-a[1]) * Math.PI/180;
  const s = Math.sin(dLat/2)**2 + Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

function minDistFromRoute(pos:[number,number], route:[number,number][]): number {
  let min = Infinity;
  for (let i = 0; i < route.length; i++) {
    const d = haversine(pos, route[i]);
    if (d < min) min = d;
  }
  return min * 1000; // meters
}

function animateMarker(marker: L.Marker, newLL: L.LatLng, dur = 800) {
  const start = marker.getLatLng();
  const t0 = performance.now();
  function frame(now: number) {
    const t = Math.min((now - t0) / dur, 1);
    const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    marker.setLatLng([
      start.lat + (newLL.lat - start.lat) * ease,
      start.lng + (newLL.lng - start.lng) * ease,
    ]);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function statusColor(s: Shipment): string {
  if (s.status === "delayed" || s.status === "offline") return "#EF4444";
  if (s.status === "pending" || s.delay_risk === "HIGH" || s.delay_risk === "MEDIUM") return "#F59E0B";
  return "#10B981";
}

function driverIcon(): L.DivIcon {
  return L.divIcon({
    className: "driver-marker-wrap",
    html: `<div class="driver-marker"><div class="driver-dot"></div><div class="driver-ring"></div></div>`,
    iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14],
  });
}

function shipmentIcon(color: string, delayed: boolean): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
      <div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 8px ${color};position:relative;z-index:2"></div>
      ${delayed ? `<div style="position:absolute;width:24px;height:24px;border-radius:50%;border:2px solid ${color};animation:ping 1.5s ease-out infinite;opacity:0"></div>` : ""}
    </div>`,
    iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12],
  });
}

async function fetchOSRMRoute(from:[number,number], to:[number,number]): Promise<[number,number][]|null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes?.[0]) {
      return data.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number,number]);
    }
  } catch (e) { console.warn("OSRM fetch failed", e); }
  return null;
}

function straightLineRoute(from:[number,number], to:[number,number]): [number,number][] {
  const pts: [number,number][] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([from[0]+(to[0]-from[0])*t, from[1]+(to[1]-from[1])*t]);
  }
  return pts;
}

// ── CSS ──
const MAP_CSS = `
  .driver-marker { position: relative; display: flex; align-items: center; justify-content: center; }
  .driver-dot { width:16px;height:16px;border-radius:50%;background:#3B82F6;border:2px solid white;box-shadow:0 0 12px #3B82F6;position:relative;z-index:2; }
  .driver-ring { position:absolute;top:-6px;left:-6px;width:28px;height:28px;border-radius:50%;border:2px solid #3B82F6;animation:ping 1.5s ease-out infinite;opacity:0; }
  @keyframes ping { 0%{transform:scale(0.8);opacity:0.8} 100%{transform:scale(2);opacity:0} }
  .leaflet-container { background:#000 !important; font-family:inherit; }
  .leaflet-control-attribution { background:rgba(0,0,0,0.5)!important;color:#888!important;border-top-left-radius:6px;padding:2px 6px;font-size:10px; }
  .leaflet-control-attribution a { color:#888!important;text-decoration:none; }
  .leaflet-popup-content-wrapper { background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.5); }
  .leaflet-popup-tip { background:var(--surface);border:1px solid var(--border);border-top:none;border-left:none; }
  .leaflet-popup-content { margin:12px; }
  .reroute-banner { position:absolute;top:40px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(245,158,11,0.9);color:#000;padding:6px 16px;border-radius:8px;font-size:12px;font-weight:600;backdrop-filter:blur(8px);pointer-events:none;animation:fadeInOut 4s forwards; }
  @keyframes fadeInOut { 0%{opacity:0;transform:translateX(-50%) translateY(-10px)} 10%{opacity:1;transform:translateX(-50%) translateY(0)} 80%{opacity:1} 100%{opacity:0} }
`;

export default function DashboardMap({ shipments, filter, onAskAstra, fitAllTrigger }: DashboardMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const driversRef = useRef<Map<string, DriverState>>(new Map());
  const intervalsRef = useRef<number[]>([]);
  const layersRef = useRef<L.Layer[]>([]);
  const [simMode, setSimMode] = useState(true);
  const [rerouteBanner, setRerouteBanner] = useState<string|null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const onAskAstraRef = useRef(onAskAstra);
  onAskAstraRef.current = onAskAstra;

  const isDemo = shipments.length === 0;
  const displayShipments = isDemo ? DEMO_SHIPMENTS : shipments;

  const filtered = displayShipments.filter((s) => {
    if (filter === "all") return true;
    if (filter === "delayed" && (s.status === "delayed" || s.status === "offline")) return true;
    if (filter === "at-risk" && (s.status === "pending" || s.delay_risk === "HIGH" || s.delay_risk === "MEDIUM")) return true;
    return false;
  });

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [20.5937, 78.9629], zoom: 5, zoomControl: false,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CartoDB</a>',
    }).addTo(map);
    mapRef.current = map;

    // Static layers: corridors
    CORRIDORS.forEach(c => {
      const l = L.polyline(c, { color:"#3B82F6", weight:8, opacity:0.12 }).addTo(map);
      layersRef.current.push(l);
    });
    // Heatzones
    HEATZONES.forEach(z => {
      const c = L.circle(z.coords, { radius:80000, color:"#EF4444", fillColor:"#EF4444", fillOpacity:0.10, weight:1 }).addTo(map);
      c.bindTooltip("High Congestion Zone — avg delay +2.4hrs", { direction:"top", className:"leaflet-tooltip-custom" });
      layersRef.current.push(c);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Cleanup all driver layers
  const clearDrivers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    driversRef.current.forEach(d => {
      if (d.marker) map.removeLayer(d.marker);
      if (d.routeLine) map.removeLayer(d.routeLine);
      if (d.traveledLine) map.removeLayer(d.traveledLine);
      if (d.rerouteLine) map.removeLayer(d.rerouteLine);
    });
    driversRef.current.clear();
    intervalsRef.current.forEach(id => clearInterval(id));
    intervalsRef.current = [];
  }, []);

  // Build popups
  const buildPopup = useCallback((d: DriverState) => {
    const s = d.shipment;
    const col = statusColor(s);
    const statusLabel = s.status === "active" ? "ON TRACK" : s.status.toUpperCase();
    return `<div style="min-width:220px;font-family:inherit">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:8px">
        <span style="font-family:monospace;font-size:12px;color:var(--accent);font-weight:700">${s.tracking_id}</span>
        <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;background:${col}20;color:${col}">${statusLabel}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;margin-bottom:8px">
        <span style="color:var(--text-muted)">Route</span><span style="text-align:right;color:var(--text);font-weight:500">${s.origin} → ${s.destination}</span>
        <span style="color:var(--text-muted)">Driver</span><span style="text-align:right;color:var(--text);font-weight:500">${s.driver_name}</span>
        <span style="color:var(--text-muted)">Speed</span><span style="text-align:right;color:var(--text);font-weight:500">${Math.round(d.speed)} km/h</span>
        <span style="color:var(--text-muted)">ETA</span><span style="text-align:right;color:var(--text);font-weight:500">${d.etaMinutes > 0 ? `${Math.floor(d.etaMinutes/60)}h ${d.etaMinutes%60}m` : "Arrived"}</span>
        <span style="color:var(--text-muted)">Distance left</span><span style="text-align:right;color:var(--text);font-weight:500">${d.distLeftKm.toFixed(1)} km</span>
      </div>
      <button onclick="window.__astraMapAsk__('${s.tracking_id}','${s.origin}','${s.destination}','${s.status}')" style="width:100%;padding:6px;border-radius:6px;background:var(--accent);color:white;font-size:11px;font-weight:600;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px">Ask Astra</button>
    </div>`;
  }, []);

  // Global popup handler
  useEffect(() => {
    (window as any).__astraMapAsk__ = (tid: string, orig: string, dest: string, status: string) => {
      onAskAstraRef.current(`Shipment ${tid} from ${orig} to ${dest} is ${status}. Analyze delay risks and suggest route optimizations.`);
    };
    return () => { delete (window as any).__astraMapAsk__; };
  }, []);

  // Init drivers + simulation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || filtered.length === 0) return;

    clearDrivers();

    const initDrivers = async () => {
      for (const s of filtered) {
        const origin = s.coords || DEST_COORDS[s.origin] || [20, 78] as [number, number];
        const destCoord = DEST_COORDS[s.destination] || [origin[0] + 3, origin[1] + 2] as [number, number];

        let route = await fetchOSRMRoute(origin, destCoord);
        if (!route || route.length < 2) route = straightLineRoute(origin, destCoord);

        const color = statusColor(s);
        const isDelayed = color === "#EF4444";

        // Origin/destination markers
        const originMarker = L.marker(origin, { icon: shipmentIcon(color, isDelayed) }).addTo(map);
        originMarker.bindTooltip(s.origin, { direction: "top", className: "leaflet-tooltip-custom" });
        layersRef.current.push(originMarker);

        // Route line
        const routeLine = L.polyline(route, {
          color: "#3B82F6", weight: 3, opacity: 0.6,
          dashArray: isDelayed ? "8, 8" : undefined,
        }).addTo(map);

        // Traveled line
        const traveledLine = L.polyline([], { color: "#10B981", weight: 3, opacity: 0.8 }).addTo(map);

        // Driver marker
        const marker = L.marker(origin, { icon: driverIcon(), zIndexOffset: 1000 }).addTo(map);

        const totalDist = route.reduce((sum, pt, i) => i === 0 ? 0 : sum + haversine(route[i-1], pt), 0);
        const baseSpeed = 40 + Math.random() * 30;

        const state: DriverState = {
          id: s.id, shipment: s, currentPos: [...origin],
          routeCoords: route, traveledCoords: [[...origin]],
          routeIndex: 0, speed: baseSpeed,
          etaMinutes: Math.round((totalDist / baseSpeed) * 60),
          distLeftKm: totalDist, rerouted: false, rerouteTime: 0,
          marker, routeLine, traveledLine, rerouteLine: null,
        };

        // Bind initial popup
        marker.bindPopup(buildPopup(state));
        driversRef.current.set(s.id, state);
      }

      setActiveCount(filtered.length);

      // Fit map
      const allPts = filtered.map(s => s.coords || DEST_COORDS[s.origin] || [20, 78] as [number, number]);
      if (allPts.length > 0) {
        map.fitBounds(L.latLngBounds(allPts), { padding: [50, 50], maxZoom: 10 });
      }

      // Simulation loop
      if (simMode) {
        const simInterval = window.setInterval(() => {
          driversRef.current.forEach((d) => {
            if (d.routeIndex >= d.routeCoords.length - 1) return;

            // Advance along route
            const stepsPerTick = 1 + Math.floor(Math.random() * 2);
            d.routeIndex = Math.min(d.routeIndex + stepsPerTick, d.routeCoords.length - 1);
            const newPos = d.routeCoords[d.routeIndex];
            d.currentPos = [...newPos];

            // Update traveled path (cap at 50)
            d.traveledCoords.push([...newPos]);
            if (d.traveledCoords.length > 50) d.traveledCoords.shift();
            d.traveledLine?.setLatLngs(d.traveledCoords);

            // Animate marker
            if (d.marker) {
              animateMarker(d.marker, L.latLng(newPos[0], newPos[1]), 2500);
            }

            // Recalc ETA
            let remaining = 0;
            for (let i = d.routeIndex; i < d.routeCoords.length - 1; i++) {
              remaining += haversine(d.routeCoords[i], d.routeCoords[i + 1]);
            }
            d.distLeftKm = remaining;
            d.speed = 40 + Math.random() * 30;
            d.etaMinutes = Math.round((remaining / d.speed) * 60);

            // Update popup content
            if (d.marker) d.marker.setPopupContent(buildPopup(d));
          });
        }, 3000);
        intervalsRef.current.push(simInterval);

        // Reroute simulation for delayed shipments after 15s
        const rerouteTimeout = window.setTimeout(() => {
          driversRef.current.forEach((d) => {
            if (d.shipment.status !== "delayed") return;
            if (d.rerouted) return;
            d.rerouted = true;

            setRerouteBanner(`${d.shipment.tracking_id}: Route deviation detected — recalculating...`);
            setTimeout(() => setRerouteBanner(null), 4000);

            // Visual: mark old route orange briefly
            if (d.routeLine) d.routeLine.setStyle({ color: "#F59E0B", opacity: 0.9 });
            setTimeout(() => {
              if (d.routeLine) d.routeLine.setStyle({ color: "#3B82F6", opacity: 0.4 });
            }, 3000);

            // Reroute from current position
            const dest = DEST_COORDS[d.shipment.destination] || d.routeCoords[d.routeCoords.length - 1];
            fetchOSRMRoute(d.currentPos, dest).then(newRoute => {
              if (newRoute && newRoute.length > 2 && map) {
                // Remove old route, draw new
                if (d.routeLine) map.removeLayer(d.routeLine);
                d.routeCoords = newRoute;
                d.routeIndex = 0;
                d.routeLine = L.polyline(newRoute, { color: "#F59E0B", weight: 3, opacity: 0.8 }).addTo(map);
                // Fade to blue after 3s
                setTimeout(() => {
                  if (d.routeLine) d.routeLine.setStyle({ color: "#3B82F6", opacity: 0.6 });
                }, 3000);
              }
            });
          });
        }, 15000);
        intervalsRef.current.push(rerouteTimeout as any);
      }
    };

    initDrivers();

    return () => { clearDrivers(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, simMode, clearDrivers, buildPopup]);

  // Fit all trigger
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitAllTrigger === 0) return;
    const pts: [number, number][] = [];
    driversRef.current.forEach(d => pts.push(d.currentPos));
    if (pts.length > 0) map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 10 });
  }, [fitAllTrigger]);

  // Toggle sim mode
  const toggleMode = () => {
    const next = !simMode;
    setSimMode(next);
    if (typeof window !== "undefined") localStorage.setItem("astra-map-mode", next ? "sim" : "live");
  };

  return (
    <div className="relative">
      <style dangerouslySetInnerHTML={{ __html: MAP_CSS }} />

      {/* Map Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-[var(--text-secondary)]" />
          <span className="text-sm font-semibold text-[var(--text)]">Live Fleet Map</span>
          <span className="flex items-center gap-1.5 ml-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">{activeCount} Active</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${simMode ? "border-blue-500/30 bg-blue-500/10 text-blue-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}`}>
            <Radio className="w-3 h-3" />
            {simMode ? "Simulation" : "Live GPS"}
          </button>
        </div>
      </div>

      {/* Reroute banner */}
      {rerouteBanner && (
        <div className="reroute-banner">{rerouteBanner}</div>
      )}

      {/* Demo banner */}
      {isDemo && (
        <div className="absolute top-[52px] left-1/2 -translate-x-1/2 z-[1000] bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-xs text-white/80 pointer-events-none">
          Showing demo data — connect shipments to see live tracking
        </div>
      )}

      {/* Map container */}
      <div ref={containerRef} className="w-full h-[260px] md:h-[340px] lg:h-[420px]" />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-black/70 backdrop-blur-md rounded-lg px-3 py-2.5 border border-white/10 pointer-events-none">
        <div className="space-y-1.5">
          {[
            ["#3B82F6", "Driver (moving)", "circle"],
            ["#10B981", "Traveled path", "line"],
            ["#3B82F6", "Planned route", "line"],
            ["#EF4444", "Congestion zone", "circle"],
            ["#F59E0B", "Rerouted", "line"],
          ].map(([color, label, type]) => (
            <div key={label} className="flex items-center gap-2">
              {type === "circle" ? (
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
              ) : (
                <span className="w-4 h-0.5 flex-shrink-0 rounded" style={{ background: color }} />
              )}
              <span className="text-[10px] text-white/70">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
