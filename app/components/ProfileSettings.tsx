"use client";

import { useState } from "react";

type ProfileSettingsProps = {
  initialProfile: {
    skinType: string | null;
    preferences: string[];
    allergies: string[];
  } | null;
};

function toCsv(values: string[]) {
  return values.join(", ");
}

function fromCsv(value: string) {
  return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
}

const SKIN_TYPE_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "sensitive", label: "Sensitive" },
  { value: "dry", label: "Dry" },
  { value: "oily", label: "Oily" },
  { value: "combination", label: "Combination" },
  { value: "acne-prone", label: "Acne-prone" },
];

export default function ProfileSettings({ initialProfile }: ProfileSettingsProps) {
  const [skinType, setSkinType] = useState(initialProfile?.skinType ?? "");
  const [preferences, setPreferences] = useState(toCsv(initialProfile?.preferences ?? []));
  const [allergies, setAllergies] = useState(toCsv(initialProfile?.allergies ?? []));
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    setStatus("");

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        skinType: skinType || null,
        preferences: fromCsv(preferences),
        allergies: fromCsv(allergies),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus(data.error || "Unable to save your profile.");
      setIsSaving(false);
      return;
    }

    setPreferences(toCsv(data.profile.preferences ?? []));
    setAllergies(toCsv(data.profile.allergies ?? []));
    setSkinType(data.profile.skinType ?? "");
    setStatus("Profile saved. Future explanations will use these preferences.");
    setIsSaving(false);
  };

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <p className="text-sm text-neutral-500">Personalization</p>
        <h2 className="mt-2 text-xl font-semibold text-neutral-900">Profile Settings</h2>
        <p className="mt-2 text-sm text-neutral-600">
          These settings shape the AI explanation so it can prioritize what matters most to you.
        </p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-neutral-800">Skin type</span>
          <select
            value={skinType}
            onChange={(event) => setSkinType(event.target.value)}
            className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-rose-400"
          >
            {SKIN_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-neutral-800">Preferences</span>
          <input
            value={preferences}
            onChange={(event) => setPreferences(event.target.value)}
            placeholder="fragrance-free, vegan, pregnancy-safe"
            className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-rose-400"
          />
          <span className="mt-2 block text-xs text-neutral-500">
            Separate items with commas.
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-neutral-800">Allergies</span>
          <input
            value={allergies}
            onChange={(event) => setAllergies(event.target.value)}
            placeholder="linalool, limonene"
            className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-rose-400"
          />
          <span className="mt-2 block text-xs text-neutral-500">
            We use direct text matches only, so specific ingredient names work best.
          </span>
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving ? "Saving..." : "Save Profile"}
        </button>
        {status && <p className="text-sm text-neutral-600">{status}</p>}
      </div>
    </section>
  );
}
