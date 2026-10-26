# Build and self-hosting

## Browser client

Node.js 24, npm and a modern browser are required. `npm ci` installs the locked dependencies; `npm run dev` starts Vite on port 5173. Production assets are emitted to `dist/` by `npm run build`.

The clean snapshot defaults to local demo mode. To use your own Supabase project, copy `.env.example` to `.env.local` and set only its **public** project URL and publishable/anon key. Never put a service-role, Stripe, Resend or LiveKit secret in a `VITE_` variable. Production builds use `.env.production` or your host's protected build configuration. The included ignore file excludes all environment files except the empty example.

## Backend

Provision a separate Supabase project you control. Review and apply `supabase/migrations/` in filename order to an empty database. These files establish schemas, restrictive RLS, RPCs and scheduled maintenance; they are not a copy of production data. The public snapshot neutralises deployment identifiers and a historical migration comment; do not apply the snapshot over the existing official service as a migration repair.

Replace `your-project` and official-domain references with your own project/domain before deployment, including Auth redirect allowlists, Storage URLs, Edge Function CORS/return URLs, Cron HTTP destinations, Steam callbacks, native URL policy and website links. A fresh installation has no official owner/admin account: assign your own administrator deliberately through a reviewed service-side database action. Review the production-specific official-community bootstrap in the migration history; it must not be pointed at the official database.

Configure Supabase Auth, email templates and redirect URLs; bind the Before User Created hook to `public.before_onyx_signup` if using the prepared signup protection. Configure Turnstile/CAPTCHA and SMTP in your own dashboards. Anonymous sign-in is needed for guest access. Review password protection settings, rate limits and MFA requirements. Do not disable RLS to make setup work.

Edge Functions in `supabase/functions/` read server-side secret **names** from the environment. Supply values using your platform's secret store, not committed files. Deploy only functions needed for your installation. Preserve their own authentication: payment/push/webhook public entrypoints validate provider signatures or dispatch secrets internally; user actions validate Auth and account session state. Do not enable payments until your own catalogue, contracts, webhook signature verification and tax/merchant configuration are complete.

Billing functions initially import the checked-in **closed** `commerce-policy.example.ts`. To configure commerce, create your own ignored `website/merchant-public.local.json`, review the purchase terms, run `node scripts/commerce/build-policy.mjs`, then change the policy import in `billing/index.ts` and `billing-webhook/index.ts` to `commerce-policy.generated.ts` before deploying. The generated policy and local operator file must remain ignored. This deliberate setup step prevents a fresh fork from accidentally accepting payments under the upstream operator's contracts.

Voice/video requires your own LiveKit deployment and the `voice` / `voice-webhook` handlers. Browser echo cancellation/noise suppression remains available; no Krisp runtime or licence grant is included.

The public commerce form uses only `CF-Connecting-IP` from the protected hosted ingress for its IP quota; it never trusts `X-Forwarded-For` or `X-Real-IP`. Missing, multiple or malformed values fail before storing a declaration or sending mail. IPv6 addresses share a canonical /64 network quota; IPv4-mapped addresses share the corresponding plain IPv4 quota. Only salted hashes reach the quota store. For self-hosting, establish a proxy that overwrites visitor-IP headers and cannot be bypassed before adapting this boundary. A header alone is not authentication. Existing recipient/global quotas remain independent safeguards. URL-like text is rejected in echoed declaration fields; bare domain paths are also rejected in the name field.

SQL tests under `supabase/tests/` must run in rollback transactions on a separate development database. Read and compare sequence values before/after; rollback does not reset sequences. Never execute fixture suites against a live customer database.

## Node deployment

Build first, then run `npm start`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for your own backend. The server serves `dist/`, invitation metadata and downloads; it is not the database. Terminate HTTPS at a trusted host/reverse proxy, preserve the supplied security headers, and configure `PORT`. On managed Node hosting use `server.js` as the entrypoint and `dist` as output. The `.htaccess` file is a fallback, not a replacement for the Node process.

## Windows source

On Windows install .NET SDK 10 and the WebView2 runtime. The source snapshot defaults to the non-routable placeholder `https://example.invalid/app/`. Set the application origin in `desktop/Onyx.Desktop/DesktopPolicy.cs` and replace reserved branding before using the build. From the repository root:

```sh
node desktop/build-desktop.mjs
dotnet restore desktop/Onyx.Desktop/Onyx.Desktop.csproj --locked-mode
dotnet publish desktop/Onyx.Desktop/Onyx.Desktop.csproj -c Release
```

The optional activity companion is under `desktop/Onyx.Activity/`; `node desktop/build.mjs` prepares its resources. No compiled EXE, .NET runtime, WebView2 runtime or installer is included. Their redistribution and signing requirements are separate from the application source licence. The desktop shell loads a configured hosted client, so publishing a fork also requires hosting its web client/backend.
