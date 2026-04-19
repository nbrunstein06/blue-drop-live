"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";

export default function Home() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [participantId, setParticipantId] = useState<string | null>(null);

  async function handleSubmit() {
  if (!firstName || !lastName || !accepted) {
    alert("Merci de remplir tous les champs");
    return;
  }

  setLoading(true);

  const { data, error } = await supabase
    .from("participants")
    .insert({
      first_name: firstName,
      last_name: lastName,
      accepted_cgu: true,
      share_active: true,
    })
    .select()
    .single();

  if (error) {
    alert("Erreur");
    setLoading(false);
    return;
  }

  navigator.geolocation.getCurrentPosition(async (position) => {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;

  await supabase
    .from("participants")
    .update({
      last_lat: lat,
      last_lng: lng,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  await supabase.from("locations").insert({
    participant_id: data.id,
    lat,
    lng,
  });
});

setParticipantId(data.id);

  alert("Connexion activée !");
  setLoading(false);
}
useEffect(() => {
  if (!participantId) return;

  const interval = setInterval(() => {
    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      await supabase
        .from("participants")
        .update({
          last_lat: lat,
          last_lng: lng,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", participantId);

      await supabase.from("locations").insert({
        participant_id: participantId,
        lat,
        lng,
      });
    });
  }, 20000);

  return () => clearInterval(interval);
}, [participantId]);
  return (
    <main style={{ padding: 30 }}>
      <h1>Connexion</h1>

      <input
        placeholder="Prénom"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
      />
      <br /><br />

      <input
        placeholder="Nom"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
      />
      <br /><br />

      <label>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        J’accepte les CGU
      </label>

      <br /><br />

      <button onClick={handleSubmit} disabled={loading}>
        {loading ? "..." : "Démarrer"}
      </button>
    </main>
  );
}