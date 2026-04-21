"use client";
import dynamic from "next/dynamic"
const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(m => m.Popup), { ssr: false });
const Polyline = dynamic(() => import("react-leaflet").then(m => m.Polyline), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then(m => m.CircleMarker), { ssr: false });
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase-browser";
import "leaflet/dist/leaflet.css"
import { useMap } from "react-leaflet";
function RecenterMap({
  position,
}: {
  position: [number, number] | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.setView(position, 15);
    }
  }, [position, map]);

  return null;
}
export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isLogged, setIsLogged] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapRef = useRef<any>(null)
  const [selectedPosition, setSelectedPosition] = useState<[number, number] | null>(null);
  const [tracks, setTracks] = useState<Record<string, any[]>>({});
  const [kayakIcon, setKayakIcon] = useState<any>(null);

  async function loadParticipants() {
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const participantsList = data || [];
  setParticipants(participantsList);
  await loadTracks(participantsList);
}

async function loadTracks(participantsList: any[]) {
  const nextTracks: Record<string, any[]> = {};

  for (const p of participantsList) {
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();

const { data, error } = await supabase
  .from("locations")
  .select("id, lat, lng, created_at")
  .eq("participant_id", p.id)
  .gte("created_at", twentyMinutesAgo)
  .order("created_at", { ascending: false });

    if (!error && data) {
      nextTracks[p.id] = data;
    } else {
      nextTracks[p.id] = [];
    }
  }

  setTracks(nextTracks);
}
useEffect(() => {
  import("leaflet").then((mod) => {
    const L = mod.default;
    const icon = new L.DivIcon({
      html: '<div style="font-size: 26px;">🛶</div>',
      className: ""
    });
    setKayakIcon(icon);
  });
}, []);
  useEffect(() => {
  if (!isLogged) return;

  loadParticipants();

  const interval = setInterval(() => {
    loadParticipants();
  }, 5000);

  return () => clearInterval(interval);
}, [isLogged]);

  function handleLogin() {
    if (password === "1234") {
      setIsLogged(true);
    } else {
      alert("Mot de passe incorrect");
    }
  }

  async function stopParticipant(id: string) {
    await supabase
      .from("participants")
      .update({
        share_active: false,
        stopped_by_admin: true,
      })
      .eq("id", id);

    loadParticipants();
  }

  if (!isLogged) {
    return (
      <main style={{ padding: 30 }}>
        <h1>Admin</h1>
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={handleLogin}>Se connecter</button>
      </main>
    );
  }

  return (
    <main style={{ padding: 30 }}>
      <h1>Participants</h1>
      <div style={{ height: 700, marginBottom: 30 }}
      >
  <div style={{ padding: 12, background: "#fff", borderBottom: "1px solid #ddd" }}>
  <div style={{ fontWeight: "bold", marginBottom: 8 }}>
    Participants actifs
  </div>

  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
    {participants
      .filter((p) => p.share_active)
      .map((p) => (
        <button
          key={p.id}
          onClick={() => {
            setSelectedId(p.id)

            const pts = tracks[p.id] || []
            if (pts.length > 0 && mapRef.current) {
              mapRef.current.setView([pts[0].lat, pts[0].lng], 16)
            }
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: selectedId === p.id ? "2px solid #2563eb" : "1px solid #ccc",
            background: selectedId === p.id ? "#dbeafe" : "#fff",
            cursor: "pointer",
          }}
        >
          {p.first_name || p.last_name
            ? `${p.first_name || ""} ${p.last_name || ""}`.trim()
            : p.name || "Sans nom"}
        </button>
      ))}
  </div>
</div>
  <MapContainer
  ref={mapRef}
  center={[43.5725, 7.0467] as [number, number]}
  zoom={13}
  style={{ height: "100%", width: "100%" }}
>
  <RecenterMap position={selectedPosition} />
    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

    {participants.map((p) => {
      if (!p.share_active) return null
  const points = tracks[p.id] || [];
  const ordered = [...points].reverse();
  const path = ordered.map((pt) => [pt.lat, pt.lng] as [number, number]);
  const latest = ordered[0] ;
  const batteryColor =
      p. battery_level == null  
      ? "gray"
      : p.battery_level > 0.6
      ? "green"
      : p.battery_level >0.2
      ? "orange"
      : "red"

  return (
    <div key={p.id}>
      {path.length >= 2 && (
  <Polyline
    positions={path}
    pathOptions={{ color: "#2563eb", weight: 6, opacity: 0.9 }}
  />
)}
      {latest && (
  <CircleMarker
    center={[latest.lat, latest.lng]}
    radius={14}
    pathOptions={{
      color: batteryColor,
      fillColor: batteryColor,
      fillOpacity: 0.55,
    }}
  />
)}
      {latest && kayakIcon && (
  <Marker
    position={[latest.lat, latest.lng]}
    icon={kayakIcon}
  >
    <Popup>
  {p.first_name || p.last_name
    ? `${p.first_name || ""} ${p.last_name || ""}`
    : p.name}
  <br />
  Position actuelle
  <br />
  Dernier point :{" "}
  {latest?.created_at
    ? new Date(latest.created_at).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "inconnu"}
  <br />
  <span
  style={{
    color:
      p.battery_level == null
        ? "gray"
        : p.battery_level < 0.2
        ? "red"
        : "black",
    fontWeight: p.battery_level < 0.2 ? "bold" : "normal",
  }}
>
  Batterie :{" "}
  {p.battery_level != null
    ? `${Math.round(p.battery_level * 100)}%`
    : "inconnue"}
  {p.battery_level != null && p.battery_level < 0.2 ? " ⚠️ Batterie faible" : ""}
</span>
  
</Popup>
  </Marker>
)}

      {ordered[1] && (
        <CircleMarker
          center={[ordered[1].lat, ordered[1].lng]}
          radius={8}
          pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.9 }}
        >
          <Popup>Point précédent</Popup>
        </CircleMarker>
      )}

      {ordered[2] && (
        <CircleMarker
          center={[ordered[2].lat, ordered[2].lng]}
          radius={6}
          pathOptions={{ color: "#93c5fd", fillColor: "#93c5fd", fillOpacity: 0.8 }}
        >
          <Popup>Point plus ancien</Popup>
        </CircleMarker>
      )}

      {path.length >= 2 && (
        <Polyline positions={path} pathOptions={{ color: "#2563eb", weight: 3 }} />
      )}
    </div>
  );
})}
  </MapContainer>
</div>

      {participants.map((p) => {
  const pts = tracks[p.id] || []

  return (
    <div
      key={p.id}
      onClick={() => {
        setSelectedId(p.id)
        if (pts.length > 0 && mapRef.current) {
          mapRef.current.setView([pts[0].lat, pts[0].lng], 16)
        }
      }}
      style={{
        padding: "8px",
        marginBottom: "4px",
        cursor: "pointer",
        borderRadius: "6px",
        background: selectedId === p.id ? "#e0f2fe" : "white",
      }}
    >
      <div>
        <strong>{p.first_name || ""} {p.last_name || ""}</strong>
      </div>

      <div>Actif : {p.share_active ? "oui" : "non"}</div>
      <div>Lat : {p.last_lat ?? "?"}</div>
      <div>Lng : {p.last_lng ?? "?"}</div>
      <div>
        Batterie : {p.battery_level != null ? `${Math.round(p.battery_level * 100)}%` : "inconnue"}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation()
          stopParticipant(p.id)
        }}
      >
        Arrêter
      </button>
    </div>
  )
})}
    </main>
  );
}