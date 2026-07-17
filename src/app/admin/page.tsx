"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "../ui.module.css";

type Invite = {
  token: string;
  createdAt: number;
  expiresAt: number;
  usedByIdentity: string | null;
  usedByName: string | null;
  usedAt: number | null;
};

type Participant = {
  identity: string;
  name: string;
  joinedAt: number;
};

const PARTICIPANTS_POLL_MS = 5000;

function formatDateTime(ms: number) {
  return new Date(ms).toLocaleString("nl-NL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [authenticating, setAuthenticating] = useState(false);

  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadError, setLoadError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [newInviteUrl, setNewInviteUrl] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantsError, setParticipantsError] = useState("");

  const fetchInvites = useCallback(async (key: string) => {
    const res = await fetch("/api/admin/invites", {
      headers: { "x-admin-key": key },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Kon uitnodigingen niet ophalen.");
    }
    return data.invites as Invite[];
  }, []);

  const fetchParticipants = useCallback(async (key: string) => {
    const res = await fetch("/api/admin/participants", {
      headers: { "x-admin-key": key },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Kon deelnemers niet ophalen.");
    }
    return data.participants as Participant[];
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("admin-key");
    if (!stored) return;
    (async () => {
      try {
        const list = await fetchInvites(stored);
        setAdminKey(stored);
        setInvites(list);
        setAuthenticated(true);
      } catch {
        sessionStorage.removeItem("admin-key");
      }
    })();
  }, [fetchInvites]);

  // Ververst wie er in de kamer is én de links-lijst (voor de groen/rood-
  // bolletjes) zolang je op de admin-pagina bent ingelogd.
  useEffect(() => {
    if (!authenticated) return;

    let cancelled = false;

    async function poll() {
      try {
        const list = await fetchParticipants(adminKey);
        if (!cancelled) {
          setParticipants(list);
          setParticipantsError("");
        }
      } catch (err) {
        if (!cancelled) {
          setParticipantsError(
            err instanceof Error ? err.message : "Kon deelnemers niet ophalen.",
          );
        }
      }

      try {
        const list = await fetchInvites(adminKey);
        if (!cancelled) {
          setInvites(list);
          setLoadError("");
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Kon uitnodigingen niet ophalen.");
        }
      }
    }

    poll();
    const interval = setInterval(poll, PARTICIPANTS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authenticated, adminKey, fetchParticipants, fetchInvites]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthenticating(true);
    try {
      const list = await fetchInvites(keyInput);
      sessionStorage.setItem("admin-key", keyInput);
      setAdminKey(keyInput);
      setInvites(list);
      setAuthenticated(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Onjuiste admin-sleutel.");
    } finally {
      setAuthenticating(false);
    }
  }

  async function refreshInvites() {
    try {
      const list = await fetchInvites(adminKey);
      setInvites(list);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Kon uitnodigingen niet ophalen.");
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setNewInviteUrl("");
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Kon geen link genereren.");
      }
      const url = `${window.location.origin}/invite/${data.invite.token}`;
      setNewInviteUrl(url);
      await refreshInvites();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Kon geen link genereren.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke(token: string) {
    try {
      const res = await fetch("/api/admin/invites/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Kon link niet intrekken.");
      }
      await refreshInvites();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Kon link niet intrekken.");
    }
  }

  async function copyToClipboard(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyFeedback("Gekopieerd!");
      setTimeout(() => setCopyFeedback(""), 2000);
    } catch {
      setCopyFeedback("Kopiëren mislukt.");
    }
  }

  if (!authenticated) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <form className={styles.card} onSubmit={handleLogin}>
            <h1>Admin</h1>
            <p className={styles.subtitle}>Vul de admin-sleutel in om verder te gaan.</p>

            <label className={styles.label} htmlFor="admin-key">
              Admin-sleutel
            </label>
            <input
              id="admin-key"
              className={styles.input}
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              autoFocus
            />

            {authError && <p className={styles.error}>{authError}</p>}

            <button className={styles.button} type="submit" disabled={authenticating}>
              {authenticating ? "Bezig..." : "Inloggen"}
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.stack}>
          <div className={`${styles.card} ${styles.cardWide}`}>
            <h1>Wie is er nu in de kamer</h1>
            <p className={styles.subtitle}>
              Live overzicht, ververst elke {PARTICIPANTS_POLL_MS / 1000} seconden.
            </p>

            {participantsError && <p className={styles.error}>{participantsError}</p>}

            <ul className={styles.presenceList}>
              {participants.map((p) => (
                <li key={p.identity} className={styles.presenceItem}>
                  <span className={`${styles.presenceDot} ${styles.presenceDotOnline}`} />
                  <span>{p.name}</span>
                  <span className={styles.presenceJoined}>
                    sinds {formatDateTime(p.joinedAt)}
                  </span>
                </li>
              ))}
              {participants.length === 0 && !participantsError && (
                <li className={styles.presenceItem}>
                  <span className={`${styles.presenceDot} ${styles.presenceDotOffline}`} />
                  <span style={{ color: "var(--text-secondary)" }}>Niemand aanwezig.</span>
                </li>
              )}
            </ul>
          </div>

          <div className={`${styles.card} ${styles.cardWide}`}>
            <div className={styles.toolbar}>
              <div>
                <h1>Uitnodigingslinks</h1>
                <p className={styles.subtitle}>
                  Groen = degene die deze link gebruikte is nu online. Rood =
                  nog niet gebruikt, of inmiddels weer uitgelogd. Links
                  verdwijnen vanzelf na hun geldigheidsduur, of meteen als je
                  ze intrekt/verwijdert.
                </p>
              </div>
              <button className={styles.button} onClick={handleGenerate} disabled={generating}>
                {generating ? "Bezig..." : "Nieuwe link genereren"}
              </button>
            </div>

            {newInviteUrl && (
              <div className={styles.linkCell} style={{ marginBottom: 20 }}>
                <span className={styles.linkText}>{newInviteUrl}</span>
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  onClick={() => copyToClipboard(newInviteUrl)}
                >
                  {copyFeedback || "Kopiëren"}
                </button>
              </div>
            )}

            {loadError && <p className={styles.error}>{loadError}</p>}

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Aangemaakt</th>
                    <th>Verloopt</th>
                    <th>Link</th>
                    <th>Status</th>
                    <th>Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite, index) => {
                    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${invite.token}`;
                    const isOnline =
                      invite.usedByIdentity != null &&
                      participants.some((p) => p.identity === invite.usedByIdentity);
                    const statusTitle = invite.usedByName
                      ? `${invite.usedByName}${isOnline ? " is nu online" : " is niet (meer) online"}`
                      : "Nog niet gebruikt";
                    return (
                      <tr key={invite.token}>
                        <td>{index + 1}</td>
                        <td>{formatDateTime(invite.createdAt)}</td>
                        <td>{formatDateTime(invite.expiresAt)}</td>
                        <td>
                          <div className={styles.linkCell}>
                            <span className={styles.linkText}>{url}</span>
                            <button
                              type="button"
                              className={styles.buttonSecondary}
                              onClick={() => copyToClipboard(url)}
                            >
                              Kopiëren
                            </button>
                          </div>
                        </td>
                        <td title={statusTitle}>
                          <span
                            className={`${styles.presenceDot} ${
                              isOnline ? styles.presenceDotOnline : styles.presenceDotOffline
                            }`}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.buttonDanger}
                            onClick={() => handleRevoke(invite.token)}
                          >
                            {invite.usedByIdentity ? "Verwijderen" : "Intrekken"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {invites.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ color: "var(--text-secondary)", padding: 16 }}>
                        Geen actieve uitnodigingen.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
