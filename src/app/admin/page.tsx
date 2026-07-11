"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "../ui.module.css";

type Invite = {
  token: string;
  createdAt: number;
  expiresAt: number;
};

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
        <div className={`${styles.card} ${styles.cardWide}`}>
          <div className={styles.toolbar}>
            <div>
              <h1>Uitnodigingslinks</h1>
              <p className={styles.subtitle}>
                Alleen actieve links staan hieronder — gebruikte, verlopen of
                ingetrokken links verdwijnen direct uit deze lijst.
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
                  <th>Aangemaakt</th>
                  <th>Verloopt</th>
                  <th>Link</th>
                  <th>Actie</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => {
                  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${invite.token}`;
                  return (
                    <tr key={invite.token}>
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
                      <td>
                        <button
                          type="button"
                          className={styles.buttonDanger}
                          onClick={() => handleRevoke(invite.token)}
                        >
                          Intrekken
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {invites.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--text-secondary)", padding: 16 }}>
                      Geen actieve uitnodigingen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
