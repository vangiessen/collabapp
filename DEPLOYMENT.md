# Deployment op Vercel

De app is gebouwd om zonder tunnel of eigen server te draaien: Next.js host je
op [Vercel](https://vercel.com) (gratis hobby-tier is voldoende), en de
uitnodigingstokens staan in [Upstash Redis](https://upstash.com) (ook een
gratis tier) via hun REST-API — dus geen lokale schijf nodig, wat perfect
past bij Vercel's serverless functies.

## 1. Upstash Redis-database aanmaken

Zie de uitleg in [.env.example](.env.example) en de toelichting die je al
hebt gekregen voor `UPSTASH_REDIS_REST_URL` en `UPSTASH_REDIS_REST_TOKEN`.

## 2. Project naar GitHub pushen

Vercel deployt vanuit een git-repository. Zet dit project in een (eventueel
privé) GitHub-repository als dat nog niet zo is.

## 3. Project importeren in Vercel

1. Ga naar [vercel.com/new](https://vercel.com/new) en importeer de
   GitHub-repository. Vercel herkent Next.js automatisch — geen extra
   buildconfiguratie nodig.
2. Voordat je op **Deploy** klikt, voeg je bij **Environment Variables** alle
   variabelen uit `.env.local` toe:

   ```
   NEXT_PUBLIC_LIVEKIT_URL
   LIVEKIT_API_KEY
   LIVEKIT_API_SECRET
   ADMIN_KEY
   ROOM_NAME
   INVITE_TTL_HOURS
   UPSTASH_REDIS_REST_URL
   UPSTASH_REDIS_REST_TOKEN
   ```

   **Belangrijk:** genereer een nieuwe, sterke `ADMIN_KEY` voor de live
   omgeving als je die nog niet hebt (bijv. met
   `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`)
   — dit is de enige beveiliging tussen de buitenwereld en je
   "nieuwe link genereren"-knop.

3. Klik op **Deploy**. Na een minuut of twee krijg je een live URL zoals
   `https://jouw-project.vercel.app`.

## 4. Eigen domein koppelen (optioneel)

In het Vercel-dashboard van je project: **Settings → Domains** → voeg je
domein toe en volg de instructies om de DNS-records bij je registrar aan te
passen (of wijs de nameservers naar Vercel). Vercel regelt het HTTPS-
certificaat automatisch.

## 5. Testen

- Ga naar `https://jouw-domein-of-vercel-url/admin`, log in met je
  `ADMIN_KEY` en genereer een uitnodigingslink.
- Open de link (bij voorkeur op een ander apparaat/netwerk) en controleer dat
  je de kamer in kunt.
- Camera en microfoon werken alleen over HTTPS (behalve op `localhost`) —
  Vercel geeft dat automatisch, dus dat zit al goed.

## Updates uitrollen

Push naar je git-branch die aan Vercel gekoppeld is (meestal `main`) —
Vercel bouwt en deployt automatisch bij elke push.
