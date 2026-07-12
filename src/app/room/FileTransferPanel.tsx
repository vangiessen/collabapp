"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import type { ByteStreamHandler } from "livekit-client";
import styles from "./room.module.css";

const FILE_TRANSFER_TOPIC = "file-transfer";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

type TransferStatus = "in-progress" | "done" | "error";

type Transfer = {
  id: string;
  name: string;
  size: number;
  senderName: string;
  direction: "sent" | "received";
  timestamp: number;
  status: TransferStatus;
  progress: number; // 0..1
  error?: string;
  downloadUrl?: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

export function FileTransferPanel() {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [open, setOpen] = useState(false);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler: ByteStreamHandler = (reader, participantInfo) => {
      const info = reader.info;
      const participant = room.getParticipantByIdentity(participantInfo.identity);
      const senderName = participant?.name || participantInfo.identity;

      setTransfers((prev) => [
        ...prev,
        {
          id: info.id,
          name: info.name,
          size: info.size ?? 0,
          senderName,
          direction: "received",
          timestamp: info.timestamp,
          status: "in-progress",
          progress: 0,
        },
      ]);

      reader.onProgress = (progress) => {
        setTransfers((prev) =>
          prev.map((t) =>
            t.id === info.id ? { ...t, progress: progress ?? t.progress } : t,
          ),
        );
      };

      reader
        .readAll()
        .then((chunks) => {
          const blob = new Blob(chunks as BlobPart[], {
            type: info.mimeType || "application/octet-stream",
          });
          const url = URL.createObjectURL(blob);
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === info.id
                ? { ...t, status: "done", progress: 1, downloadUrl: url }
                : t,
            ),
          );
        })
        .catch((err) => {
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === info.id
                ? {
                    ...t,
                    status: "error",
                    error:
                      err instanceof Error
                        ? err.message
                        : "Bestand is niet volledig ontvangen.",
                  }
                : t,
            ),
          );
        });
    };

    room.registerByteStreamHandler(FILE_TRANSFER_TOPIC, handler);
    return () => {
      room.unregisterByteStreamHandler(FILE_TRANSFER_TOPIC);
    };
  }, [room]);

  // Ruim object-URL's van gedownloade bestanden op zodra de pagina verlaten wordt.
  useEffect(() => {
    return () => {
      setTransfers((current) => {
        for (const t of current) {
          if (t.downloadUrl) URL.revokeObjectURL(t.downloadUrl);
        }
        return current;
      });
    };
  }, []);

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const id = crypto.randomUUID();
    const baseTransfer: Transfer = {
      id,
      name: file.name,
      size: file.size,
      senderName: localParticipant.name || "Jij",
      direction: "sent",
      timestamp: Date.now(),
      status: "in-progress",
      progress: 0,
    };

    if (file.size > MAX_FILE_SIZE) {
      setTransfers((prev) => [
        ...prev,
        {
          ...baseTransfer,
          status: "error",
          error: `Bestand is te groot (max ${formatBytes(MAX_FILE_SIZE)}).`,
        },
      ]);
      return;
    }

    setTransfers((prev) => [...prev, baseTransfer]);
    setOpen(true);

    try {
      await localParticipant.sendFile(file, {
        topic: FILE_TRANSFER_TOPIC,
        mimeType: file.type || "application/octet-stream",
        onProgress: (progress) => {
          setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, progress } : t)));
        },
      });
      setTransfers((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: "done", progress: 1 } : t)),
      );
    } catch (err) {
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status: "error",
                error: err instanceof Error ? err.message : "Versturen mislukt.",
              }
            : t,
        ),
      );
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.toggleButton}
        onClick={() => setOpen((value) => !value)}
      >
        Bestanden{transfers.length > 0 ? ` (${transfers.length})` : ""}
      </button>

      {open && (
        <div className={styles.fileTransferPanel}>
          <div className={styles.fileTransferHeader}>
            <span>Bestanden</span>
            <button type="button" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>

          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => fileInputRef.current?.click()}
          >
            Bestand versturen
          </button>
          <input ref={fileInputRef} type="file" hidden onChange={handleFileSelected} />

          <div className={styles.fileTransferList}>
            {transfers.length === 0 && (
              <p className={styles.fileTransferEmpty}>Nog geen bestanden gedeeld.</p>
            )}
            {transfers
              .slice()
              .reverse()
              .map((t) => (
                <div key={t.id} className={styles.fileTransferItem}>
                  <div className={styles.fileTransferMeta}>
                    <strong>{t.direction === "sent" ? "Jij" : t.senderName}</strong>
                    <span>{formatTime(t.timestamp)}</span>
                  </div>
                  <div className={styles.fileTransferName} title={t.name}>
                    {t.name}
                  </div>
                  <div className={styles.fileTransferSize}>{formatBytes(t.size)}</div>

                  {t.status === "in-progress" && (
                    <div className={styles.meterTrack}>
                      <div
                        className={styles.meterFill}
                        style={{ width: `${Math.round(t.progress * 100)}%` }}
                      />
                    </div>
                  )}

                  {t.status === "done" && t.direction === "received" && t.downloadUrl && (
                    <a href={t.downloadUrl} download={t.name} className={styles.toggleButton}>
                      Downloaden
                    </a>
                  )}
                  {t.status === "done" && t.direction === "sent" && (
                    <span className={styles.fileTransferDone}>Verzonden</span>
                  )}

                  {t.status === "error" && <span className={styles.slotError}>{t.error}</span>}
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
