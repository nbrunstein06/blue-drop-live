"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import "leaflet/dist/leaflet.css";

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false }
);
const Polyline = dynamic(
  () => import("react-leaflet").then((m) => m.Polyline),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((m) => m.CircleMarker),
  { ssr: false }
);

const RecenterMap = dynamic<{ position: [number, number] | null }>(
  () =>
    import("react-leaflet").then((m) => {
      return function RecenterMapInner({
        position,
      }: {
        position: [number, number] | null;
      }) {
        const map = m.useMap();

        useEffect(() => {
          if (position) {
            map.setView(position, 16);
          }
        }, [position, map]);

        return null;
      };
    }),
  { ssr: false }
);

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isLogged, setIsLogged] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [tracks, setTracks] = useState<Record<string, any[]>>({});
  const [trackInfos, setTrackInfos] = useState<Record<string, any>>({});
  const [kayakIcon, setKayakIcon] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] =
    useState<[number, number] | null>(null);

  useEffect(() => {
    import("leaflet").then((mod) => {
      const L = mod.default;

      const icon = new L.DivIcon({
        html: '<div style="font-size: 26px; line-height: 26px;">🛶</div>',
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
      });

      setKayakIcon(icon);
    });
  }, []);

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
    const nextInfos: Record<string, any> = {};
    const twentyMinutesAgo = new Date(
      Date.now() - 20 * 60 * 1000
    ).toISOString();

    for (const p of participantsList) {
      const { data: recentPoints, error: recentError } = await supabase
        .from("locations")
        .select("id, lat, lng, created_at")
        .eq("participant_id", p.id)
        .gte("created_at", twentyMinutesAgo)
        .order("created_at", { ascending: false });

      const { data: firstPoint } = await supabase
        .from("locations")
        .select("created_at")
        .eq("participant_id", p.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (!recentError && recentPoints) {
        nextTracks[p.id] = recentPoints;
        nextInfos[p.id] = {
          startedAt: firstPoint?.[0]?.created_at || null,
          lastSeenAt: recentPoints?.[0]?.created_at || p.last_seen_at || null,
        };
      } else {
        nextTracks[p.id] = [];
        nextInfos[p.id] = {
          startedAt: firstPoint?.[0]?.created_at || null,
          lastSeenAt: p.last_seen_at || null,
        };
      }
    }

    setTracks(nextTracks);
    setTrackInfos(nextInfos);
  }

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

    await loadParticipants();
  }

  async function stopAllParticipants() {
    const confirmStop = window.confirm(
      "Voulez-vous vraiment arrêter tous les suivis actifs ?"
    );

    if (!confirmStop) return;

    const { error } = await supabase
      .from("participants")
      .update({
        share_active: false,
        stopped_by_admin: true,
      })
      .eq("share_active", true);

    if (error) {
      console.error(error);
      alert("Erreur lors de l'arrêt global");
      return;
    }

    await loadParticipants();
    alert("Tous les suivis ont été arrêtés");
  }

  async function clearHistory() {
    const confirmDelete = window.confirm(
      "Voulez-vous vraiment effacer l'historique et supprimer les participants inactifs ?"
    );

    if (!confirmDelete) return;

    const { error: deleteLocationsError } = await supabase
      .from("locations")
      .delete()
      .not("id", "is", null);

    if (deleteLocationsError) {
      console.error(deleteLocationsError);
      alert("Erreur suppression historique : " + deleteLocationsError.message);
      return;
    }

    const { error: deleteParticipantsError } = await supabase
      .from("participants")
      .delete()
      .eq("share_active", false);

    if (deleteParticipantsError) {
      console.error(deleteParticipantsError);
      alert(
        "Erreur suppression participants inactifs : " +
          deleteParticipantsError.message
      );
      return;
    }

    setTracks({});
    setTrackInfos({});
    await loadParticipants();

    alert("Historique effacé et participants inactifs supprimés");
  }

  function getName(p: any) {
    return p.first_name || p.last_name
      ? `${p.first_name || ""} ${p.last_name || ""}`.trim()
      : p.name || "Sans nom";
  }

  function getBatteryColor(level: number | null | undefined) {
    if (level == null) return "gray";
    if (level > 0.6) return "green";
    if (level > 0.2) return "orange";
    return "red";
  }

  function formatTime(value: string | null | undefined) {
    if (!value) return "inconnue";

    return new Date(value).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function isSignalOld(value: string | null | undefined) {
    if (!value) return true;
    return Date.now() - new Date(value).getTime() > 3 * 60 * 1000;
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
          style={{
            padding: 10,
            marginRight: 10,
            border: "1px solid #ccc",
            borderRadius: 6,
          }}
        />

        <button
          onClick={handleLogin}
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            border: "none",
            background: "#2563eb",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Se connecter
        </button>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 16,
        background: "#f3f4f6",
        minHeight: "100vh",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ marginTop: 0, marginBottom: 12 }}>Participants</h1>

      <section
        style={{
          background: "white",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <strong>Actions admin</strong>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              onClick={clearHistory}
              style={{
                padding: "8px 12px",
                background: "#dc2626",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Effacer l'historique
            </button>

            <button
              onClick={stopAllParticipants}
              style={{
                padding: "8px 12px",
                background: "#111827",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Arrêter tous les suivis
            </button>
          </div>
        </div>
      </section>

      <section
        style={{
          background: "white",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 8 }}>
          Participants actifs
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {participants
            .filter((p) => p.share_active)
            .map((p) => {
              const pts = tracks[p.id] || [];
              const latest = pts[0];

              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedId(p.id);

                    if (latest) {
                      setSelectedPosition([latest.lat, latest.lng]);
                    } else if (p.last_lat && p.last_lng) {
                      setSelectedPosition([p.last_lat, p.last_lng]);
                    }
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border:
                      selectedId === p.id
                        ? "2px solid #2563eb"
                        : "1px solid #ccc",
                    background: selectedId === p.id ? "#dbeafe" : "#fff",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  {getName(p)}
                </button>
              );
            })}
        </div>
      </section>

      <section
        style={{
          height: "60vh",
          width: "100%",
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 16,
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        }}
      >
        <MapContainer
          center={[43.5725, 7.0467] as [number, number]}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
        >
          <RecenterMap position={selectedPosition} />

          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {participants.map((p) => {
            if (!p.share_active) return null;

            const points = tracks[p.id] || [];
            const ordered = [...points].reverse();
            const path = ordered.map((pt) => [pt.lat, pt.lng] as [
              number,
              number
            ]);
            const latest = points[0];
            const batteryColor = getBatteryColor(p.battery_level);
            const info = trackInfos[p.id] || {};

            if (!latest) return null;

            return (
              <div key={p.id}>
                {path.length >= 2 && (
                  <Polyline
                    positions={path}
                    pathOptions={{
                      color: "#2563eb",
                      weight: 6,
                      opacity: 0.9,
                    }}
                  />
                )}

                <CircleMarker
                  center={[latest.lat, latest.lng]}
                  radius={14}
                  pathOptions={{
                    color: batteryColor,
                    fillColor: batteryColor,
                    fillOpacity: 0.55,
                  }}
                />

                {kayakIcon && (
                  <Marker
                    position={[latest.lat, latest.lng]}
                    icon={kayakIcon}
                  >
                    <Popup>
                      <strong>{getName(p)}</strong>
                      <br />
                      Position actuelle
                      <br />
                      Départ : {formatTime(info.startedAt)}
                      <br />
                      Dernier point : {formatTime(info.lastSeenAt)}
                      <br />
                      <span
                        style={{
                          color:
                            p.battery_level == null
                              ? "gray"
                              : p.battery_level < 0.2
                              ? "red"
                              : "black",
                          fontWeight:
                            p.battery_level != null && p.battery_level < 0.2
                              ? "bold"
                              : "normal",
                        }}
                      >
                        Batterie :{" "}
                        {p.battery_level != null
                          ? `${Math.round(p.battery_level * 100)}%`
                          : "inconnue"}
                        {p.battery_level != null && p.battery_level < 0.2
                          ? " ⚠️ Batterie faible"
                          : ""}
                      </span>
                      <br />
                      {isSignalOld(info.lastSeenAt) && (
                        <span style={{ color: "#dc2626", fontWeight: "bold" }}>
                          ⚠️ Signal ancien
                        </span>
                      )}
                    </Popup>
                  </Marker>
                )}

                {ordered[1] && (
                  <CircleMarker
                    center={[ordered[1].lat, ordered[1].lng]}
                    radius={8}
                    pathOptions={{
                      color: "#3b82f6",
                      fillColor: "#3b82f6",
                      fillOpacity: 0.9,
                    }}
                  >
                    <Popup>Point précédent</Popup>
                  </CircleMarker>
                )}

                {ordered[2] && (
                  <CircleMarker
                    center={[ordered[2].lat, ordered[2].lng]}
                    radius={6}
                    pathOptions={{
                      color: "#93c5fd",
                      fillColor: "#93c5fd",
                      fillOpacity: 0.8,
                    }}
                  >
                    <Popup>Point plus ancien</Popup>
                  </CircleMarker>
                )}
              </div>
            );
          })}
        </MapContainer>
      </section>

      <section>
        <h2 style={{ marginBottom: 10 }}>Liste des participants</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {participants.map((p) => {
            const pts = tracks[p.id] || [];
            const latest = pts[0];
            const info = trackInfos[p.id] || {};
            const batteryColor = getBatteryColor(p.battery_level);
            const signalOld = isSignalOld(info.lastSeenAt);

            return (
              <div
                key={p.id}
                onClick={() => {
                  setSelectedId(p.id);

                  if (latest) {
                    setSelectedPosition([latest.lat, latest.lng]);
                  } else if (p.last_lat && p.last_lng) {
                    setSelectedPosition([p.last_lat, p.last_lng]);
                  }
                }}
                style={{
                  background: selectedId === p.id ? "#e0f2fe" : "white",
                  border:
                    selectedId === p.id
                      ? "2px solid #0284c7"
                      : "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 14,
                  cursor: "pointer",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <strong style={{ fontSize: 18 }}>{getName(p)}</strong>

                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: "bold",
                      background: p.share_active ? "#dcfce7" : "#e5e7eb",
                      color: p.share_active ? "#166534" : "#6b7280",
                    }}
                  >
                    {p.share_active ? "Actif" : "Inactif"}
                  </span>
                </div>

                <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                  <div>Départ : {formatTime(info.startedAt)}</div>
                  <div>
                    Dernier point : {formatTime(info.lastSeenAt)}
                    {signalOld && (
                      <span style={{ color: "#dc2626", fontWeight: "bold" }}>
                        {" "}
                        ⚠️
                      </span>
                    )}
                  </div>

                  <div>
                    Batterie :{" "}
                    <span style={{ color: batteryColor, fontWeight: "bold" }}>
                      {p.battery_level != null
                        ? `${Math.round(p.battery_level * 100)}%`
                        : "inconnue"}
                    </span>
                    {p.battery_level != null && p.battery_level < 0.2
                      ? " ⚠️ Batterie faible"
                      : ""}
                  </div>

                  <div style={{ color: "#6b7280", fontSize: 12 }}>
                    Lat : {p.last_lat ?? "?"}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>
                    Lng : {p.last_lng ?? "?"}
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (p.share_active) {
                      stopParticipant(p.id);
                    }
                  }}
                  disabled={!p.share_active}
                  style={{
                    marginTop: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #dc2626",
                    background: p.share_active ? "#dc2626" : "#e5e7eb",
                    color: p.share_active ? "white" : "#6b7280",
                    cursor: p.share_active ? "pointer" : "not-allowed",
                    fontWeight: "bold",
                    width: "100%",
                  }}
                >
                  {p.share_active ? "Arrêter" : "Inactif"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}