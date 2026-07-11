"use client";

import { FormEvent, use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../ui.module.css";

type CheckState = "checking" | "valid" | "invalid";

const STATUS_MESSAGES: Record<string, string> = {
  not_found: "Deze uitnodigingslink is ongeldig, verlopen of al gebruikt.",
};

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [checkState, setCheckState] = useState<CheckState>("checking");
  const [invalidReason, setInvalidReason] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/invite/${token}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.valid) {
          setCheckState("valid");
        } else {
          setInvalidReason(STATUS_MESSAGES[data.status] ?? "Deze uitnodigingslink is ongeldig.");
          setCheckState("invalid");
        }
      } catch {
        if (!cancelled) {
          setInvalidReason("Kon de uitnodigingslink niet controleren.");
          setCheckState("invalid");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Vul je naam in.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: trimmedName }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Kon niet deelnemen.");
      }
      sessionStorage.setItem(
        "livekit-session",
        JSON.stringify({ token: data.token, url: data.url, name: data.name }),
      );
      router.push("/room");
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Kon niet deelnemen.");
    }
  }

  if (checkState === "checking") {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <div className={styles.card}>
            <p className={styles.subtitle}>Uitnodiging controleren...</p>
          </div>
        </main>
      </div>
    );
  }

  if (checkState === "invalid") {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <div className={styles.card}>
            <h1>Ongeldige uitnodiging</h1>
            <p className={styles.subtitle}>{invalidReason}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <h1>Kamer binnengaan</h1>
          <p className={styles.subtitle}>Vul je naam in om deel te nemen.</p>

          <label className={styles.label} htmlFor="name">
            Naam
          </label>
          <input
            id="name"
            className={styles.input}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Je naam"
            autoComplete="name"
            autoFocus
          />

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.button} type="submit" disabled={submitting}>
            {submitting ? "Bezig..." : "Deelnemen"}
          </button>
        </form>
      </main>
    </div>
  );
}
