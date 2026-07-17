## LiveKit video-/audiokamer

Real-time videobellen voor 2-3 deelnemers met Next.js en LiveKit:

- **Uitnodigingslinks als enige toegang**: een beschermde admin-pagina
  (`/admin`) om met één klik eenmalige, tijdelijke uitnodigingslinks te
  genereren, bekijken en intrekken — elk genummerd (`#1`, `#2`, ...) zodat
  meteen duidelijk is welke het nieuwst is. Gasten kunnen alleen via zo'n link
  binnenkomen (naam invullen, geen account) — er is geen open "vul zelf een
  kamercode in"-toegang meer.
- **Live "wie is er nu in de kamer"-overzicht** op de admin-pagina: een groen
  bolletje per daadwerkelijk verbonden deelnemer, ververst elke 5 seconden.
- Tweerichtings webcam (start uit, zelf aan/uit te zetten via de Camera-knop)
- **Schermdelen met automatische focus-layout**: zodra iemand zijn scherm
  deelt, wordt dat groot getoond met de webcams klein ernaast (niet allemaal
  even grote vlakken). Stopt het schermdelen, dan gaat de weergave terug naar
  een normaal grid van webcams.
- **Twee onafhankelijke audio-ingangen**, elk met eigen apparaatkeuze en eigen
  aan/uit-knop, tegelijk te gebruiken:
  - **Praten**: normale spraakverwerking aan (echo cancellation, noise
    suppression, AGC), voor verstaanbaar gesprek.
  - **Muziek**: geen spraakverwerking, stereo, hoge kwaliteit (Opus,
    ~128kbps, geen DTX) — voor een instrument, mixer of muziekbron.
- **Audiomixer met VU-meters**: voor je eigen "Praten" en "Muziek" een
  live niveaumeter plus gain-slider (0-200%) die het uitgaande niveau
  bijstelt vóórdat het verstuurd wordt. Voor elke binnenkomende deelnemer/bron
  een eigen VU-meter en volumeslider (0-100%) om te bepalen hoe luid jij ze hoort.
- **Audio-uitgang kiezen**: net als bij de ingangen kun je ook het apparaat
  kiezen waarop je iedereen hoort (bijv. een specifieke koptelefoon of de
  uitgang van een audio-interface). Werkt alleen in browsers die
  `setSinkId` ondersteunen (Chromium-gebaseerd; niet Firefox/Safari) — in
  andere browsers verschijnt de keuze simpelweg niet.
- **Bestanden delen** via LiveKit's data channel (geen externe opslag nodig):
  een "Bestanden"-knop opent een paneel om een bestand te kiezen en te
  versturen, met voortgangsbalk, automatische chunking/reassembly voor grote
  bestanden, een maximum van 100MB (met nette foutmelding erboven), een
  downloadknop met de originele bestandsnaam zodra een bestand volledig is
  ontvangen, en een lijst die toont wie wat wanneer heeft gestuurd. Valt de
  verbinding halverwege weg, dan krijg je een duidelijke foutmelding in plaats
  van een hangende voortgangsbalk.
- Token-generatie via een server-side API-route (`/api/join`) met de LiveKit server SDK.

### 1. Installeren

```bash
npm install
```

### 2. LiveKit Cloud-account aanmaken (gratis)

1. Ga naar [cloud.livekit.io](https://cloud.livekit.io) en maak een gratis account aan
   (inloggen kan met GitHub/Google of e-mail).
2. Maak na het inloggen een nieuw project aan, bijv. "video-app". LiveKit Cloud
   heeft een gratis laag die ruim voldoende is om dit te testen.
3. Open je project en ga naar **Settings > Keys**.
4. Klik op **Create Key** (of gebruik de automatisch aangemaakte key). Je krijgt
   een **API Key** en **API Secret** te zien. Kopieer beide direct — het secret
   wordt daarna niet meer volledig getoond.
5. Noteer ook de **WebSocket URL** van je project, boven in het dashboard of bij
   Settings, in de vorm `wss://jouw-projectnaam.livekit.cloud`.

### 3. Environment-variabelen instellen

Kopieer het voorbeeldbestand:

```bash
cp .env.example .env.local
```

Open `.env.local` en vul je eigen gegevens in:

```
NEXT_PUBLIC_LIVEKIT_URL=wss://jouw-projectnaam.livekit.cloud
LIVEKIT_API_KEY=jouw-api-key
LIVEKIT_API_SECRET=jouw-api-secret

ADMIN_KEY=verzin-een-lange-willekeurige-sleutel
ROOM_NAME=studio
INVITE_TTL_HOURS=24

UPSTASH_REDIS_REST_URL=https://jouw-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=jouw-upstash-rest-token
```

`ADMIN_KEY` is het wachtwoord voor de admin-pagina (`/admin`) — verzin zelf
een lange, willekeurige waarde (bijv. met `openssl rand -hex 32`) en deel hem
met niemand. `ROOM_NAME` is de ene vaste kamer waar alle uitnodigingen
naartoe leiden. `INVITE_TTL_HOURS` bepaalt hoe lang een link geldig blijft
voordat hij vanzelf verloopt.

`UPSTASH_REDIS_REST_URL` en `UPSTASH_REDIS_REST_TOKEN` zijn nodig om
uitnodigingstokens op te slaan (in plaats van een lokaal bestand, zodat de
app ook op Vercel werkt). Zo vind je ze:

1. Maak een gratis account op [console.upstash.com](https://console.upstash.com).
2. Klik op **Create Database** (kies een regio dicht bij waar je gaat hosten,
   bijv. Frankfurt/eu-west voor Europa).
3. Open de nieuwe database → tabblad **REST API**.
4. Daar staan beide waarden kant-en-klaar om te kopiëren (vaak ook via een
   ".env"-knop die beide regels in één keer geeft).

### 4. Starten

```bash
npm run dev
```

**Als host:**

1. Ga naar [http://localhost:3000/admin](http://localhost:3000/admin) en log
   in met je `ADMIN_KEY`.
2. Klik op **Nieuwe link genereren**. De link verschijnt bovenaan (met
   kopieerknop) en in de tabel eronder.
3. Stuur de link naar je gast. De tabel toont alleen nog **actieve** links —
   zodra een link gebruikt, verlopen of ingetrokken is, verdwijnt hij direct
   uit de lijst (er wordt geen geschiedenis bijgehouden). Klik op
   **Intrekken** om een actieve link direct ongeldig te maken en te verwijderen.

**Als gast:**

1. Open de ontvangen uitnodigingslink (`/invite/...`).
2. Is de link geldig? Vul je naam in en klik op **Deelnemen** — je komt direct
   de kamer in, geen account nodig. De link is dan meteen verbruikt en werkt
   daarna niet meer.
3. Is de link ongeldig, gebruikt of verlopen? Dan zie je een duidelijke
   melding in plaats van een crash.

**Om zelf met twee "gasten" te testen:** genereer twee aparte uitnodigingslinks
op de admin-pagina en open ze in twee verschillende browsertabbladen, elk met
een andere naam.

4. Klik in de kamer bij **Uitgaand** op "Starten" onder Praten en/of Muziek —
   beide kunnen tegelijk aanstaan. Kies eventueel een specifiek apparaat via
   het dropdown-menu (bijv. je laptop-microfoon voor praten en een
   USB-audio-interface voor muziek), en stel het niveau bij met de slider
   terwijl je de VU-meter in de gaten houdt.
5. Bij **Inkomend** verschijnt per binnenkomende deelnemer/bron een eigen
   VU-meter en volumeslider, waarmee je zelf bepaalt hoe luid je ze hoort.
6. Klik op **Camera** om je webcam aan te zetten, en test schermdelen via de
   knop in de control bar onderin.

> Let op: de browser vraagt per tabblad toestemming voor camera/microfoon.
> De meeste browsers/besturingssystemen laten niet toe dat twee tabbladen
> tegelijk dezelfde fysieke webcam of microfoon gebruiken — dat is een
> hardwarebeperking, geen bug. Je krijgt dan een melding als "Je camera is al
> in gebruik door een ander tabblad of programma" bovenin de kamer te zien,
> maar de rest van de verbinding (audio, chat met de ander) blijft gewoon
> werken. Test met twee losse camera's/microfoons voor het meest realistische
> scenario (bijv. twee apparaten, of twee verschillende browsers).

### Hoe de uitnodigingslinks werken

Zie [src/lib/invites.ts](src/lib/invites.ts) en de routes onder
[src/app/api](src/app/api):

- Elk token is `crypto.randomBytes(32).toString("hex")` (256 bits entropie) en
  wordt opgeslagen als een losse key (`invite:<token>`) in **Upstash Redis**,
  via hun REST-API (`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`) —
  geen lokale schijf nodig, wat de app geschikt maakt voor Vercel's serverless
  functies. Elke key krijgt een Redis-TTL gelijk aan de verlooptijd: Redis
  ruimt verlopen tokens vanzelf op, er is geen aparte opruimstap nodig. Zodra
  een token gebruikt of ingetrokken wordt, verwijderen we de key direct
  (`GETDEL` resp. `DEL`) — er wordt geen gebruiksgeschiedenis bijgehouden. Een
  apart, nooit-vervallend Redis-teller-key (`INCR`) geeft elke link een
  doorlopend volgnummer, zodat de nieuwste altijd herkenbaar is ook al zijn
  oudere links intussen verdwenen.
- `GET /api/admin/participants` (ook admin-only) vraagt via LiveKit's
  server-SDK (`RoomServiceClient.listParticipants`) op wie er live in de
  kamer aanwezig is — losstaand van de invite-opslag, want een gebruikt
  token bestaat na het joinen niet meer om aan te koppelen.
- `POST /api/admin/invites` (maakt aan) en `GET /api/admin/invites` (lijst,
  via `KEYS`+een pipeline van `GET`/`TTL` per token) en
  `POST /api/admin/invites/revoke` (trekt in door de key te verwijderen) zijn
  alleen bruikbaar met de juiste `x-admin-key`-header, gecontroleerd tegen
  `ADMIN_KEY`. De admin-pagina bewaart je sleutel alleen in `sessionStorage`
  (niet in een cookie) en stuurt hem mee bij elke actie.
- `GET /api/invite/[token]` controleert de status zonder te verbruiken (voor
  de "is deze link nog geldig?"-check op de gastpagina).
- `POST /api/join` verbruikt het token atomair via Redis' `GETDEL` (lezen en
  verwijderen in één commando, dus geen race condition bij gelijktijdige
  pogingen met hetzelfde token) en genereert pas dán een LiveKit-token voor de
  vaste `ROOM_NAME`-kamer.
- De gast krijgt zijn LiveKit-token via `/invite/[token]` teruggestuurd,
  bewaart het in `sessionStorage` en wordt doorgestuurd naar `/room`, dat dat
  token uitleest — zo hoeft een ververste `/room`-pagina niet opnieuw een
  (inmiddels verbruikt) uitnodigingstoken te gebruiken.

### Hoe de audiomixer werkt

Zie [src/app/room/page.tsx](src/app/room/page.tsx):

- **Uitgaand** (`AudioInputControl`, hergebruikt voor zowel Praten als Muziek):
  de microfoon wordt via de Web Audio API opgehaald en door een `GainNode`
  geleid vóórdat hij gepubliceerd wordt (`localParticipant.publishTrack`
  krijgt de bewerkte `MediaStreamTrack` van een `MediaStreamAudioDestinationNode`).
  De gain-slider stelt live `gainNode.gain.value` bij (geen herstart nodig), en
  een `AnalyserNode` na de gain voedt de VU-meter — die toont dus precies het
  niveau zoals het verstuurd wordt. Praten en Muziek gebruiken elk hun eigen
  `captureOptions`/`publishOptions` (zie `TALK_SLOT`/`MUSIC_SLOT`), publiceren
  onder een eigen `source` (`Microphone` resp. `Unknown`) en kunnen zo
  onafhankelijk starten/stoppen en van apparaat wisselen.
- **Inkomend** (`RemoteAudioMixer`/`RemoteAudioMixerRow`): voor elke
  binnenkomende audiotrack van andere deelnemers wordt met LiveKit's
  `createAudioAnalyser()` een VU-meter gevoed, en regelt de slider het
  afspeelvolume via `RemoteAudioTrack.setVolume()` — dit beïnvloedt alleen wat
  jij hoort, niet wat anderen ontvangen.
- **Audio-uitgang** (`AudioOutputControl`): gebruikt LiveKit's eigen
  `useMediaDeviceSelect({ kind: "audiooutput" })`-hook, die intern
  `room.switchActiveDevice("audiooutput", deviceId)` aanroept — dat zet
  `HTMLMediaElement.setSinkId()` op alle huidige én toekomstige audio-elementen
  in de kamer. Levert de hook geen apparaten op (bijv. geen toestemming, of
  een browser zonder `setSinkId`-ondersteuning), dan toont het component
  niets in plaats van een kapotte lege lijst.

### Hoe de video-layout werkt

`RoomStage` in [src/app/room/page.tsx](src/app/room/page.tsx) gebruikt
LiveKit's eigen `FocusLayoutContainer`/`FocusLayout`/`CarouselLayout` (dezelfde
bouwstenen als het standaard `VideoConference`-component). Zodra er een actieve
schermdeel-track is, wordt die automatisch "gepind" (`usePinnedTracks` +
`pin.dispatch`) en groot getoond via `FocusLayout`, terwijl alle webcams klein
in een `CarouselLayout` ernaast staan. Zonder schermdelen valt de weergave
terug op een gewoon `GridLayout` van webcams.

Het gedeelde scherm heeft een fullscreen-knop rechtsboven
(`ScreenShareFocus`), die de standaard browser Fullscreen API gebruikt
(`element.requestFullscreen()`/`document.exitFullscreen()`). In fullscreen
vervaagt de knop na een paar seconden zonder muisbeweging en verschijnt weer
bij muisbeweging; Escape werkt automatisch via de browser (geen eigen
key-handler nodig — dat regelt de Fullscreen API zelf, wij luisteren alleen
naar `fullscreenchange` om de knoptekst/staat te synchroniseren). Omdat
`RoomAudioRenderer` buiten dit element in de DOM staat, blijft alle audio
gewoon doorspelen in fullscreen. De video zelf rekt niet uit: LiveKit's eigen
CSS zet `object-fit: contain` specifiek voor schermdeel-tracks, dus de
verhouding blijft altijd correct (met eventuele zwarte balken).

### Hoe bestanden delen werkt

`FileTransferPanel` in [src/app/room/FileTransferPanel.tsx](src/app/room/FileTransferPanel.tsx)
gebruikt LiveKit's ingebouwde data-stream-API — geen eigen chunking-protocol
of externe opslag nodig:

- **Versturen**: `localParticipant.sendFile(file, { onProgress })`. LiveKit
  knipt het bestand zelf automatisch in stukjes voor het data channel; de
  `onProgress`-callback voedt de voortgangsbalk. Bestanden groter dan 100MB
  worden client-side geweigerd vóórdat er iets verstuurd wordt.
- **Ontvangen**: `room.registerByteStreamHandler("file-transfer", ...)` geeft
  per binnenkomend bestand een `ByteStreamReader` met metadata (`name`,
  `size`, `mimeType`) en een eigen `onProgress`. `reader.readAll()` zet de
  stukjes automatisch weer in elkaar; het resultaat wordt een `Blob` en een
  downloadlink met de originele bestandsnaam.
- **Overzicht**: omdat elk bestand standaard naar alle deelnemers gaat, bouwt
  elke client zijn eigen (consistente) geschiedenis op — eigen verzonden
  bestanden plus alles wat binnenkomt, elk met afzender en tijdstip. Geen
  aparte synchronisatie nodig.
- **Afgebroken overdracht**: als de verzender halverwege de verbinding
  verliest, laat LiveKit de onderliggende stream falen met een
  `DataStreamError` ("... unexpectedly disconnected in the middle of sending
  data"); die vangen we op en tonen als foutmelding bij dat bestand, in
  plaats van een oneindig hangende voortgangsbalk.

### Latency

Er zijn geen aangepaste SFU-instellingen nodig — dit project gebruikt de
standaard LiveKit-verbindingsinstellingen (adaptive streaming, dynacast), die
al geoptimaliseerd zijn voor lage latency via WebRTC.

### Projectstructuur

- `src/app/page.tsx` — neutrale "uitnodiging vereist"-pagina (geen open toegang meer)
- `src/app/admin/page.tsx` — beveiligde admin-pagina: links genereren, bekijken, intrekken
- `src/app/invite/[token]/page.tsx` — gastpagina: controleert de link en vraagt je naam
- `src/app/room/page.tsx` — videokamer (leest de sessie uit `sessionStorage` en rendert de LiveKit UI)
- `src/app/room/FileTransferPanel.tsx` — bestanden versturen/ontvangen via LiveKit's data channel
- `src/lib/invites.ts` — opslag en logica voor uitnodigingstokens (Upstash Redis)
- `src/app/api/admin/invites/route.ts` — admin-only: lijst opvragen / nieuwe link aanmaken
- `src/app/api/admin/invites/revoke/route.ts` — admin-only: link intrekken
- `src/app/api/invite/[token]/route.ts` — publiek: status van een link controleren
- `src/app/api/join/route.ts` — publiek: verbruikt een geldig token en genereert een LiveKit join-token

### Live zetten op Vercel

Zie [DEPLOYMENT.md](DEPLOYMENT.md) voor een stap-voor-stap handleiding om dit
te hosten op Vercel (geen tunnel of eigen server nodig — de uitnodigingen
staan in Upstash Redis, dus alles werkt met Vercel's serverless functies).
