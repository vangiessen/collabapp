"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  GridLayout,
  FocusLayout,
  FocusLayoutContainer,
  CarouselLayout,
  LayoutContextProvider,
  ParticipantTile,
  TrackToggle,
  DisconnectButton,
  useTracks,
  useCreateLayoutContext,
  usePinnedTracks,
  useLocalParticipant,
  useMediaDeviceSelect,
  isTrackReference,
  type TrackReference,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import "@livekit/components-styles";
import {
  AudioPresets,
  MediaDeviceFailure,
  Track,
  createAudioAnalyser,
  type AudioCaptureOptions,
  type RemoteAudioTrack,
  type RoomOptions,
  type TrackPublishOptions,
} from "livekit-client";
import styles from "./room.module.css";
import { FileTransferPanel } from "./FileTransferPanel";

type AudioSlotConfig = {
  key: string;
  label: string;
  source: Track.Source;
  captureOptions: AudioCaptureOptions;
  publishOptions: Omit<TrackPublishOptions, "name" | "source">;
};

// "Praten": normale spraakverwerking aan, zodat gesprek verstaanbaar blijft.
const TALK_SLOT: AudioSlotConfig = {
  key: "talk",
  label: "Praten (spraak)",
  source: Track.Source.Microphone,
  captureOptions: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
  publishOptions: { dtx: true, red: true },
};

// "Muziek": geen spraakverwerking, stereo, hoge kwaliteit (Opus 128kbps, geen dtx).
const MUSIC_SLOT: AudioSlotConfig = {
  key: "music",
  label: "Muziek (hoge kwaliteit stereo)",
  source: Track.Source.Unknown,
  captureOptions: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
  },
  publishOptions: {
    dtx: false,
    forceStereo: true,
    audioPreset: AudioPresets.musicHighQualityStereo,
  },
};

const roomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
};

// Zonder microfoon-toestemming geeft de browser (uit privacyoverwegingen)
// lege labels en vaak maar één generieke "ingang" terug voor alle
// audio-apparaten, ook als er in werkelijkheid meerdere aangesloten zijn
// (bijv. een externe audio-interface). Zodra ergens toestemming is verleend
// worden de echte namen zichtbaar — vraag die toestemming daarom hier vast
// (kort, alleen om de apparaatlijst te kunnen tonen) in plaats van te wachten
// tot iemand op "Starten" klikt.
function useAudioInputDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadDevices() {
      let list = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "audioinput",
      );

      if (list.length > 0 && list.every((d) => !d.label)) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
          list = (await navigator.mediaDevices.enumerateDevices()).filter(
            (d) => d.kind === "audioinput",
          );
        } catch {
          // Toestemming geweigerd: val terug op de (labelloze) lijst hierboven.
        }
      }

      if (!cancelled) setDevices(list);
    }

    loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", loadDevices);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
    };
  }, []);

  return devices;
}

// Leest continu het niveau (0..~1) van een AnalyserNode uit voor een VU-meter.
function useAnalyserLevel(analyser: AnalyserNode | null) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (const value of data) {
        sum += (value / 255) ** 2;
      }
      setLevel(Math.sqrt(sum / data.length));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setLevel(0);
    };
  }, [analyser]);

  return level;
}

function VuMeter({ level }: { level: number }) {
  const pct = Math.min(100, Math.round(level * 220));
  return (
    <div className={styles.meterTrack}>
      <div className={styles.meterFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Losse audio-ingang (praten of muziek) met eigen apparaatkeuze, gain-slider
// en VU-meter. De track wordt handmatig opgebouwd via de Web Audio API zodat
// een GainNode het niveau kan bijsturen vóórdat de audio gepubliceerd wordt,
// en zodat een AnalyserNode datzelfde (post-gain) niveau kan meten.
function AudioInputControl({
  config,
  devices,
}: {
  config: AudioSlotConfig;
  devices: MediaDeviceInfo[];
}) {
  const { localParticipant } = useLocalParticipant();
  const [deviceId, setDeviceId] = useState("");
  const [active, setActive] = useState(false);
  const [gain, setGain] = useState(1);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState("");

  const rawTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const publishedTrackRef = useRef<MediaStreamTrack | null>(null);

  const level = useAnalyserLevel(analyser);

  async function stop() {
    if (publishedTrackRef.current) {
      await localParticipant.unpublishTrack(publishedTrackRef.current, true);
      publishedTrackRef.current = null;
    }
    rawTrackRef.current?.stop();
    rawTrackRef.current = null;
    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
    gainNodeRef.current = null;
    setAnalyser(null);
    setActive(false);
  }

  useEffect(() => {
    return () => {
      if (publishedTrackRef.current) {
        localParticipant.unpublishTrack(publishedTrackRef.current, true);
      }
      rawTrackRef.current?.stop();
      audioContextRef.current?.close();
    };
  }, [localParticipant]);

  async function start(withDeviceId?: string) {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { ...config.captureOptions, deviceId: withDeviceId || deviceId || undefined },
      });
      const rawTrack = stream.getAudioTracks()[0];

      const audioContext = new AudioContext();
      const sourceNode = audioContext.createMediaStreamSource(new MediaStream([rawTrack]));
      const gainNode = audioContext.createGain();
      gainNode.gain.value = gain;
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 512;
      const destination = audioContext.createMediaStreamDestination();

      sourceNode.connect(gainNode);
      gainNode.connect(destination);
      gainNode.connect(analyserNode);

      const processedTrack = destination.stream.getAudioTracks()[0];

      await localParticipant.publishTrack(processedTrack, {
        name: config.key,
        source: config.source,
        ...config.publishOptions,
      });

      rawTrackRef.current = rawTrack;
      audioContextRef.current = audioContext;
      gainNodeRef.current = gainNode;
      publishedTrackRef.current = processedTrack;
      setAnalyser(analyserNode);
      setActive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon audio-ingang niet starten.");
      setActive(false);
    }
  }

  async function handleDeviceChange(newDeviceId: string) {
    setDeviceId(newDeviceId);
    if (active) {
      await stop();
      await start(newDeviceId);
    }
  }

  function handleGainChange(value: number) {
    setGain(value);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = value;
    }
  }

  return (
    <div className={styles.audioSlot}>
      <span className={styles.audioSlotLabel}>{config.label}</span>
      <div className={styles.buttonGroup}>
        <button
          type="button"
          className={styles.toggleButton}
          onClick={() => (active ? stop() : start())}
        >
          {active ? "Stoppen" : "Starten"}
        </button>
        <select
          className={styles.select}
          value={deviceId}
          onChange={(event) => handleDeviceChange(event.target.value)}
        >
          <option value="">Standaardapparaat</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Ingang ${device.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
      </div>
      <VuMeter level={active ? level : 0} />
      <input
        type="range"
        min={0}
        max={2}
        step={0.01}
        value={gain}
        onChange={(event) => handleGainChange(Number(event.target.value))}
        className={styles.slider}
      />
      {error && <span className={styles.slotError}>{error}</span>}
    </div>
  );
}

// Vertaalt LiveKit's MediaDeviceFailure-classificatie naar een duidelijke
// Nederlandse melding. Dit zijn lokale apparaatconflicten (bijv. dezelfde
// webcam al open in een ander tabblad) en géén LiveKit-verbindingsfout.
function formatDeviceFailure(failure: MediaDeviceFailure | undefined, kind: string | undefined) {
  const device = kind === "videoinput" ? "camera" : kind === "audiooutput" ? "audio-uitvoer" : "microfoon";
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return `Toegang tot je ${device} is geweigerd.`;
    case MediaDeviceFailure.NotFound:
      return `Geen ${device} gevonden.`;
    case MediaDeviceFailure.DeviceInUse:
      return `Je ${device} is al in gebruik door een ander tabblad of programma.`;
    default:
      return `Kon je ${device} niet starten.`;
  }
}

function sourceLabel(source: Track.Source) {
  if (source === Track.Source.Microphone) return "Praten";
  if (source === Track.Source.Unknown) return "Muziek";
  return source;
}

// Meet het niveau van een binnenkomende (remote) audiotrack via LiveKit's
// createAudioAnalyser() helper, gepolld met requestAnimationFrame.
function useRemoteTrackLevel(track: RemoteAudioTrack | undefined) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!track) return;
    const { calculateVolume, cleanup } = createAudioAnalyser(track, { fftSize: 512 });
    let raf = 0;

    const tick = () => {
      setLevel(calculateVolume());
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      cleanup();
      setLevel(0);
    };
  }, [track]);

  return level;
}

// Volumeslider + VU-meter voor een binnenkomende audiotrack van een andere
// deelnemer. Gebruikt LiveKit's ingebouwde createAudioAnalyser() voor de
// meter en RemoteAudioTrack.setVolume() om het afspeelvolume aan te passen
// (beïnvloedt alleen wat jij hoort, niet wat anderen ontvangen).
function RemoteAudioMixerRow({ trackRef }: { trackRef: TrackReference }) {
  const track = trackRef.publication.track as RemoteAudioTrack | undefined;
  const [volume, setVolume] = useState(1);
  const level = useRemoteTrackLevel(track);

  function handleVolumeChange(value: number) {
    setVolume(value);
    track?.setVolume(value);
  }

  return (
    <div className={styles.audioSlot}>
      <span className={styles.audioSlotLabel}>
        {trackRef.participant.name || trackRef.participant.identity} —{" "}
        {sourceLabel(trackRef.source)}
      </span>
      <VuMeter level={level} />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(event) => handleVolumeChange(Number(event.target.value))}
        className={styles.slider}
      />
    </div>
  );
}

// Kiest het apparaat waarop je alle binnenkomende audio (van andere
// deelnemers) hoort, bijv. een specifieke koptelefoon of de uitgang van een
// audio-interface. Gebruikt LiveKit's eigen useMediaDeviceSelect, dat onder
// water HTMLMediaElement.setSinkId() aanroept op alle audio-elementen in de
// kamer. Niet elke browser ondersteunt dit (o.a. Firefox/Safari niet) — in
// dat geval blijft de lijst met apparaten leeg en tonen we niets.
function AudioOutputControl() {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind: "audiooutput",
    requestPermissions: true,
  });
  const [error, setError] = useState("");

  if (devices.length === 0) {
    return null;
  }

  async function handleChange(deviceId: string) {
    try {
      await setActiveMediaDevice(deviceId);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon audio-uitgang niet wisselen.");
    }
  }

  return (
    <div className={styles.audioSlot}>
      <span className={styles.audioSlotLabel}>Audio-uitgang</span>
      <select
        className={styles.select}
        value={activeDeviceId}
        onChange={(event) => handleChange(event.target.value)}
      >
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `Uitgang ${device.deviceId.slice(0, 6)}`}
          </option>
        ))}
      </select>
      {error && <span className={styles.slotError}>{error}</span>}
    </div>
  );
}

function RemoteAudioMixer() {
  const audioTracks = useTracks([Track.Source.Microphone, Track.Source.Unknown], {
    onlySubscribed: true,
  });
  const remoteAudioTracks = audioTracks.filter((trackRef) => !trackRef.participant.isLocal);

  if (remoteAudioTracks.length === 0) {
    return null;
  }

  return (
    <div className={styles.mixerSection}>
      <span className={styles.mixerTitle}>Inkomend</span>
      <div className={styles.mixerRows}>
        {remoteAudioTracks.map((trackRef) => (
          <RemoteAudioMixerRow
            key={`${trackRef.participant.identity}-${trackRef.source}`}
            trackRef={trackRef}
          />
        ))}
      </div>
    </div>
  );
}

const CONTROLS_HIDE_DELAY_MS = 3000;

// Toont het gedeelde scherm met een fullscreen-knop rechtsboven. In
// fullscreen vervaagt die knop na een paar seconden zonder muisbeweging en
// verschijnt weer zodra de muis beweegt; Escape werkt vanzelf via de
// browser's eigen Fullscreen API. Audio blijft ongemoeid, want
// RoomAudioRenderer staat buiten dit element in de DOM.
function ScreenShareFocus({ trackRef }: { trackRef: TrackReferenceOrPlaceholder }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleFullscreenChange() {
      const nowFullscreen = document.fullscreenElement === containerRef.current;
      setIsFullscreen(nowFullscreen);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setControlsVisible(true);
      if (nowFullscreen) {
        hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY_MS);
      }
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  function handleMouseMove() {
    setControlsVisible(true);
    if (!isFullscreen) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY_MS);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === containerRef.current) {
        await document.exitFullscreen();
      } else {
        await containerRef.current?.requestFullscreen();
      }
    } catch (err) {
      console.warn("Kon fullscreen niet wisselen:", err);
    }
  }

  return (
    <div ref={containerRef} className={styles.focusWrapper} onMouseMove={handleMouseMove}>
      <FocusLayout trackRef={trackRef} />
      <button
        type="button"
        onClick={toggleFullscreen}
        className={`${styles.fullscreenButton} ${
          controlsVisible ? "" : styles.fullscreenButtonHidden
        }`}
        aria-label={isFullscreen ? "Volledig scherm verlaten" : "Volledig scherm"}
      >
        {isFullscreen ? "⤡ Verkleinen" : "⤢ Volledig scherm"}
      </button>
    </div>
  );
}

// Zodra iemand zijn scherm deelt, wordt dat automatisch "gepind" en groot
// getoond; de webcams schuiven dan klein ernaast in een carousel. Zonder
// scherm delen vallen we terug op een gewoon grid van webcams.
function RoomStage() {
  const layoutContext = useCreateLayoutContext();
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const screenShareTracks = useTracks([
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]).filter(isTrackReference);

  const pinnedTracks = usePinnedTracks(layoutContext);
  const focusTrack = pinnedTracks[0];

  useEffect(() => {
    if (screenShareTracks.length > 0 && !focusTrack) {
      layoutContext.pin.dispatch?.({ msg: "set_pin", trackReference: screenShareTracks[0] });
    } else if (screenShareTracks.length === 0 && focusTrack) {
      layoutContext.pin.dispatch?.({ msg: "clear_pin" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenShareTracks.length]);

  return (
    <LayoutContextProvider value={layoutContext}>
      {focusTrack ? (
        <FocusLayoutContainer className={styles.stage}>
          <CarouselLayout tracks={cameraTracks}>
            <ParticipantTile />
          </CarouselLayout>
          <ScreenShareFocus trackRef={focusTrack} />
        </FocusLayoutContainer>
      ) : (
        <GridLayout tracks={cameraTracks} className={styles.stage}>
          <ParticipantTile />
        </GridLayout>
      )}
    </LayoutContextProvider>
  );
}

function RoomUI({
  deviceWarning,
  onDismissDeviceWarning,
}: {
  deviceWarning: string;
  onDismissDeviceWarning: () => void;
}) {
  const audioInputDevices = useAudioInputDevices();

  return (
    <div className={styles.roomLayout}>
      {deviceWarning && (
        <div className={styles.deviceWarning}>
          <span>{deviceWarning}</span>
          <button type="button" onClick={onDismissDeviceWarning}>
            ✕
          </button>
        </div>
      )}

      <RoomStage />

      <div className={styles.controlBar}>
        <div className={styles.mixerSection}>
          <span className={styles.mixerTitle}>Uitgaand</span>
          <div className={styles.mixerRows}>
            <AudioInputControl config={TALK_SLOT} devices={audioInputDevices} />
            <AudioInputControl config={MUSIC_SLOT} devices={audioInputDevices} />
          </div>
        </div>

        <AudioOutputControl />

        <RemoteAudioMixer />

        <div className={styles.audioSlot}>
          <span className={styles.audioSlotLabel}>Video</span>
          <div className={styles.buttonGroup}>
            <TrackToggle source={Track.Source.Camera} className={styles.toggleButton}>
              Camera
            </TrackToggle>
            <TrackToggle
              source={Track.Source.ScreenShare}
              className={styles.toggleButton}
            >
              Scherm delen
            </TrackToggle>
          </div>
        </div>

        <div className={styles.audioSlot}>
          <span className={styles.audioSlotLabel}>Delen</span>
          <FileTransferPanel />
        </div>

        <DisconnectButton className={styles.leaveButton}>Verlaten</DisconnectButton>
      </div>

      <RoomAudioRenderer />
    </div>
  );
}

function RoomContent() {
  const router = useRouter();

  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [deviceWarning, setDeviceWarning] = useState("");
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("livekit-session");
    if (!raw) {
      router.replace("/");
      return;
    }
    try {
      const session = JSON.parse(raw) as { token: string; url: string; name: string };
      if (!session.token || !session.url) {
        throw new Error("Ongeldige sessie.");
      }
      // sessionStorage bestaat alleen in de browser, dus dit kan pas na mount
      // gelezen worden (niet tijdens SSR) — vandaar setState in dit effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(session.token);
      setServerUrl(session.url);
    } catch {
      sessionStorage.removeItem("livekit-session");
      router.replace("/");
    }
  }, [router]);

  if (!token || !serverUrl) {
    return (
      <div style={{ padding: 24, color: "#f5f5f5", fontFamily: "sans-serif" }}>
        Verbinden met de kamer...
      </div>
    );
  }

  if (connectionError) {
    return (
      <div style={{ padding: 24, color: "#ff6b6b", fontFamily: "sans-serif" }}>
        <p>Kon geen verbinding maken met de LiveKit-server: {connectionError}</p>
        <p style={{ color: "#9a9fab" }}>
          Controleer NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY en
          LIVEKIT_API_SECRET in .env.local.
        </p>
        <button onClick={() => router.push("/")}>Terug naar login</button>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      video={false}
      audio={false}
      options={roomOptions}
      data-lk-theme="default"
      style={{ height: "100vh" }}
      onConnected={() => {
        hasConnectedRef.current = true;
      }}
      onError={(err) => {
        // Na een geslaagde verbinding kan dit ook een lokaal camera/microfoon-
        // conflict zijn (bijv. hetzelfde apparaat al open in een ander
        // tabblad) — dat is geen reden om de hele kamer af te breken.
        if (!hasConnectedRef.current) {
          setConnectionError(err.message);
        } else {
          console.warn("LiveKit-fout na verbinding:", err);
        }
      }}
      onMediaDeviceFailure={(failure, kind) => {
        setDeviceWarning(formatDeviceFailure(failure, kind));
      }}
      onDisconnected={() => {
        if (hasConnectedRef.current) {
          sessionStorage.removeItem("livekit-session");
          router.push("/");
        } else {
          setConnectionError(
            (prev) => prev || "Kon geen verbinding maken met de LiveKit-server.",
          );
        }
      }}
    >
      <RoomUI
        deviceWarning={deviceWarning}
        onDismissDeviceWarning={() => setDeviceWarning("")}
      />
    </LiveKitRoom>
  );
}

export default function RoomPage() {
  return <RoomContent />;
}
