# Betreffzeilen der ONYX-Mails

Erzeugt von `npm run emails` – nicht von Hand ändern (Texte: `src/strings.mjs`).
Jede Zeile komplett in das Feld **Subject** des jeweiligen Reiters kopieren. Supabase erlaubt höchstens 255 Zeichen im ungerenderten Betreff. Deshalb sind diese Betreffzeilen kurz und englisch; der Mailinhalt bleibt in allen 15 Sprachen aus dem Konto (`user_metadata.locale`) verfügbar.

## Confirm sign up ← `confirmation.html`

```
{{ .Token }} · ONYX email confirmation
```

## Magic link ← `magic_link.html`

```
Your ONYX sign-in code
```

## Reset password ← `recovery.html`

```
Reset your ONYX password
```

## Password changed (Security notifications) ← `password_changed.html`

```
Your ONYX password was changed
```

## Change email address ← `email_change.html`

```
{{ .Token }} · ONYX email confirmation
```
