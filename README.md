# ONYX 0.1

Community chat with direct messages, servers and channels, voice/video calls, screen sharing and profile customisation. React 19, TypeScript, Vite and Zustand power the web client; Supabase provides Auth, Postgres, Storage, Realtime and Edge Functions. The Windows application uses WinForms and WebView2 to display the hosted client.

Official service: [onyxchat.site](https://onyxchat.site/). Maintained by **rayvn**.

## Run locally

Use Node.js 24 and npm. From a clean checkout:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/app/`. Without backend configuration this is a local demonstration with synthetic data, not a connection to the official service. Never enter real credentials into a local demo.

```sh
npm run build
npm run typecheck
npm test
npm run preview
```

The build regenerates the public website and pins the app stylesheet's integrity. Run it before the tests that inspect generated website assets. No installer is included in this source snapshot. See [SETUP.md](SETUP.md) for your own backend, Windows build and deployment.

## Security and privacy

- Supabase Auth stores password hashes, not readable account passwords. The official service uses HTTPS.
- TOTP two-factor authentication is supported. Guest access does not require an email address and has restricted capabilities.
- Access checks, suspension/session checks, quotas and channel permissions are enforced by database policies/RPCs and authenticated Edge handlers. The interface is not the security boundary.
- Attachments use private storage and temporary signed URLs. Profile media and public server listings are public. New servers are listed by default; owners can disable listing.
- **Messages and calls are not end-to-end encrypted.** HTTPS/WebRTC transport security does not prevent infrastructure operators from accessing server-side data.
- Payment entitlement is granted by verified server-side Stripe events, never by a successful browser redirect. Card details go to Stripe Checkout.
- Browser noise suppression is included. The proprietary Krisp SDK/model is deliberately absent from this open-source build; selecting enhanced processing falls back to browser processing.
- The Windows preview is unsigned and has no active automatic update feed. Emulated browser tests do not establish support for every real device.

No review can guarantee the absence of vulnerabilities. Report suspected issues privately as described in [SECURITY.md](SECURITY.md).

## Source and licence

Original application code and documentation: copyright © 2026 rayvn, **AGPL-3.0-only**. The complete, unchanged licence is in [LICENSE](LICENSE). Modified network deployments must meet its corresponding-source obligations. Commercial use is permitted under the licence.

ONYX names and identifying logos are excluded from the code licence; see [TRADEMARKS.md](TRADEMARKS.md). Choose your own name and artwork for a fork. Third-party components retain their own licences; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), [licenses/](licenses/) and [DEPENDENCIES.json](DEPENDENCIES.json).

This is a fresh source snapshot, not an export of the private repository history. It contains no production credentials, customer database, private operator file, installers or internal operational records. [SOURCE-DIFFERENCES.md](SOURCE-DIFFERENCES.md) describes the deliberate differences from the hosted build. External contributions are currently closed; see [CONTRIBUTING.md](CONTRIBUTING.md).
