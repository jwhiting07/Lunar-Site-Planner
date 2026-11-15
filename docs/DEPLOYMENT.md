# Vercel deployment

Project: `elliott-crosbys-projects/lunar-site-planner`.

- Public Vercel address: https://lunar-site-planner-sigma.vercel.app/
- Primary domain: https://lunarsiteplanner.com/
- `www.lunarsiteplanner.com` redirects to the primary domain.

`vercel.json` selects the Vite preset, runs `npm run build`, and serves `dist/`.
No environment variables are required for the shipped scientific datasets.
Local Vercel project settings are ignored by Git.

## Publish an update

From the project root, using Node.js 20 or newer:

```sh
npm ci
npm test
npm run build
npx vercel login
npx vercel link --project lunar-site-planner --scope elliott-crosbys-projects
npx vercel deploy --prod --scope elliott-crosbys-projects
```

The initial production deployment includes the local workspace changes. Automatic
GitHub deployments are not connected: Vercel could not connect to the team's
`jwhiting07/Lunar-Site-Planner` repository with the account's current repository
access. Updates can be deployed with the CLI above. The repository owner can
connect the repository later under the Vercel project's Git settings.

## Porkbun DNS

Status on 2026-11-15: the production deployment is ready. The DNS records below
are saved in Porkbun, and Vercel verified both custom domains. The `www` domain
uses a 308 permanent redirect to the primary domain. Porkbun's email and unrelated
records are preserved. HTTPS and the primary-domain application were verified;
Vercel reports valid configurations for both domains. Existing resolver caches may
retain Porkbun's old values until their TTL expires.

Keep Porkbun's authoritative nameservers. Vercel recommended these records on
2026-11-15; obtain current values with `npx vercel domains verify` before changing
them in the future:

| Type | Host | Value |
| --- | --- | --- |
| A | @ | 216.150.1.1 |
| A | @ | 216.150.16.1 |
| CNAME | www | cfc1ddf236015c0c.vercel-dns-016.com |

Replace only conflicting web-hosting records at the root and `www`; preserve email
and other unrelated records. Once DNS points to Vercel, it provisions HTTPS.

## Terrain service limit

Vercel serves the application, shipped terrain profiles, and scientific data as
static assets. The Python terrain worker in `vite.config.ts` is a local Vite
middleware and is not deployed by this configuration. Exact shipped profiles work
on the hosted site. Arbitrary coordinates that need a new terrain horizon retain
the app's flat-horizon fallback and terrain-unavailable notice. A hosted equivalent
of `/api/custom-horizon` is required for on-demand terrain calculations.
