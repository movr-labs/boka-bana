# Bokabana

Next.js-app med sok, konto, login och server-side bokningar.

## Lokal utveckling

```bash
npm install
npm run dev
```

Skapa `.env.local` fran `.env.example` och satt minst `SESSION_SECRET`.

## Deploy pa Vercel

1. Importera repot i Vercel som ett Next.js-projekt.
2. Skapa en KV/Redis-databas i Vercel Storage och koppla den till projektet.
3. Satt miljovariablerna `SESSION_SECRET`, `KV_REST_API_URL` och `KV_REST_API_TOKEN` i Vercel.
4. Deploya med Vercels standardinställningar. Build command ar `npm run build`.

Utan `KV_REST_API_URL` och `KV_REST_API_TOKEN` använder appen minneslagring. Det räcker för lokal utveckling men ska inte användas för en publik deploy.
