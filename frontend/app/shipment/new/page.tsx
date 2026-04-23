"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiGet } from "@/lib/api";
import { ArrowLeft, Package, Copy, Check, MapPin, ExternalLink, MessageSquare, Send, Crosshair, Loader2 } from "lucide-react";

interface GeoResult { lat: number; lng: number; display_name: string; }
interface CreateResult { tracking_id: string; share_token: string; segment_count: number; total_distance_km: number; estimated_arrival: string; }

export default function NewShipmentPage() {
  const router = useRouter();
  const getSiteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originResults, setOriginResults] = useState<GeoResult[]>([]);
  const [destResults, setDestResults] = useState<GeoResult[]>([]);
  const [showOriginAC, setShowOriginAC] = useState(false);
  const [showDestAC, setShowDestAC] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [locating, setLocating] = useState(false);
  const originTimer = useRef<NodeJS.Timeout | null>(null);
  const destTimer = useRef<NodeJS.Timeout | null>(null);

  async function useCurrentLocation() {
    if (!navigator.geolocation) { setError("Geolocation not supported by your browser."); return; }
    setLocating(true); setError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=16`);
          const data = await res.json();
          const addr = data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          setOrigin(addr);
        } catch {
          setOrigin(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        }
        setLocating(false);
      },
      (err) => { setError(`Location error: ${err.message}`); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const fetchAutocomplete = useCallback(async (query: string, setter: (r: GeoResult[]) => void) => {
    if (query.length < 3) { setter([]); return; }
    try {
      const data = await apiGet<{ results: GeoResult[] }>(`/geocode/autocomplete?q=${encodeURIComponent(query)}&limit=5`);
      setter(data.results);
    } catch { setter([]); }
  }, []);

  function handleOriginChange(value: string) {
    setOrigin(value); setShowOriginAC(true);
    if (originTimer.current) clearTimeout(originTimer.current);
    originTimer.current = setTimeout(() => fetchAutocomplete(value, setOriginResults), 500);
  }

  function handleDestChange(value: string) {
    setDestination(value); setShowDestAC(true);
    if (destTimer.current) clearTimeout(destTimer.current);
    destTimer.current = setTimeout(() => fetchAutocomplete(value, setDestResults), 500);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!origin || !destination || !driverPhone) { setError("Origin, destination, and phone are required."); return; }
    setLoading(true); setError("");
    try {
      const data = await apiPost<CreateResult>("/shipment/create", {
        driver_phone: `+91${driverPhone.trim()}`, driver_name: driverName.trim(),
        origin: origin.trim(), destination: destination.trim(),
      });
      setResult(data);
      const link = `${getSiteUrl()}/driver/${data.share_token}`;
      const msg = `Delivery Assignment\n\nHello Driver,\n\nYou have a new delivery. Open your route:\n${link}\n\nDispatched by Astra Flow`;
      window.open(`https://wa.me/91${driverPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setError(`Failed: ${msg}`);
    } finally { setLoading(false); }
  }

  function getSmsBody() {
    if (!result) return "";
    const link = `${getSiteUrl()}/driver/${result.share_token}`;
    return `Delivery Assignment\n\nHello Driver,\n\nYou have a new delivery. Open your route:\n${link}\n\nDispatched by Astra Flow`;
  }

  function copyLink() {
    if (!result) return;
    navigator.clipboard?.writeText(getSmsBody()).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  const inputCls = "w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-all placeholder:text-[var(--text-muted)]";
  const labelCls = "block text-sm font-medium text-[var(--text-secondary)] mb-2";

  if (result) {
    const driverLink = `${getSiteUrl()}/driver/${result.share_token}`;
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
        <div className="max-w-lg w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center"><Check className="w-5 h-5 text-emerald-400" /></div>
            <div><h1 className="text-lg font-bold text-[var(--text)]">Shipment Created</h1><p className="text-xs text-[var(--text-muted)]">Ready for dispatch</p></div>
          </div>
          <div className="space-y-3 mb-6">
            {[["Tracking ID", result.tracking_id], ["Distance", `${result.total_distance_km} km`], ["Segments", result.segment_count], ["ETA", new Date(result.estimated_arrival).toLocaleString("en-IN")]].map(([l, v]) => (
              <div key={String(l)} className="flex justify-between py-2 border-b border-[var(--border)]">
                <span className="text-xs text-[var(--text-muted)]">{l}</span>
                <span className="text-sm font-semibold text-[var(--text)] font-mono">{String(v)}</span>
              </div>
            ))}
          </div>
          <div className="mb-4">
            <label className={labelCls}>Driver Tracking Link</label>
            <div className="flex gap-2">
              <input className={inputCls} value={driverLink} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
              <button onClick={copyLink} className="px-3 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-elevated)] transition-colors flex-shrink-0">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-[var(--text-secondary)]" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <a href={`sms:${driverPhone}?body=${encodeURIComponent(getSmsBody())}`} className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors">
              <MessageSquare className="w-3.5 h-3.5" /> SMS
            </a>
            <a href={`https://wa.me/${driverPhone.replace(/\D/g, '')}?text=${encodeURIComponent(getSmsBody())}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors">
              <Send className="w-3.5 h-3.5" /> WhatsApp
            </a>
            <button onClick={() => router.push(`/track/${result.tracking_id}`)} className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors">
              <MapPin className="w-3.5 h-3.5" /> Map
            </button>
          </div>
          <button onClick={() => router.push("/dashboard")} className="w-full py-3 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm transition-colors">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center"><Package className="w-5 h-5 text-[var(--accent)]" /></div>
            <div><h1 className="text-xl font-bold text-[var(--text)]">Create Shipment</h1><p className="text-xs text-[var(--text-muted)]">Dispatch a new tracked delivery</p></div>
          </div>
          <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div><label className={labelCls} htmlFor="driver-name">Driver Name</label><input id="driver-name" className={inputCls} value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="e.g. Rajesh Kumar" /></div>
              <div><label className={labelCls} htmlFor="driver-phone">Phone Number</label>
                <div className="flex"><span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-[var(--border)] bg-[var(--surface-elevated)] text-sm text-[var(--text-muted)]">+91</span>
                <input id="driver-phone" className={`${inputCls} rounded-l-none`} type="tel" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="9876543210" required maxLength={10} /></div>
              </div>
            </div>

            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-[var(--text-secondary)]" htmlFor="origin">Origin</label>
                <button type="button" onClick={useCurrentLocation} disabled={locating} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50">
                  {locating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crosshair className="w-3 h-3" />}
                  {locating ? "Locating..." : "Use Current Location"}
                </button>
              </div>
              <input id="origin" className={inputCls} value={origin} onChange={(e) => handleOriginChange(e.target.value)} onBlur={() => setTimeout(() => setShowOriginAC(false), 200)} onFocus={() => originResults.length > 0 && setShowOriginAC(true)} placeholder="e.g. Mumbai, Maharashtra" required />
              {showOriginAC && originResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg overflow-hidden">
                  {originResults.map((r, i) => (<div key={i} className="px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] cursor-pointer transition-colors" onMouseDown={() => { setOrigin(r.display_name); setShowOriginAC(false); setOriginResults([]); }}>{r.display_name}</div>))}
                </div>
              )}
            </div>

            <div className="relative"><label className={labelCls} htmlFor="destination">Destination</label>
              <input id="destination" className={inputCls} value={destination} onChange={(e) => handleDestChange(e.target.value)} onBlur={() => setTimeout(() => setShowDestAC(false), 200)} onFocus={() => destResults.length > 0 && setShowDestAC(true)} placeholder="e.g. Delhi, India" required />
              {showDestAC && destResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg overflow-hidden">
                  {destResults.map((r, i) => (<div key={i} className="px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] cursor-pointer transition-colors" onMouseDown={() => { setDestination(r.display_name); setShowDestAC(false); setDestResults([]); }}>{r.display_name}</div>))}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-4 py-2">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => router.push("/dashboard")} className="flex-1 py-3 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] font-semibold text-sm hover:bg-[var(--surface-elevated)] transition-colors">Cancel</button>
              <button type="submit" disabled={loading} className="flex-1 py-3 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-semibold text-sm transition-colors">
                {loading ? "Creating..." : "Create Shipment"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
