# Public room gateway

This is the deliberately small server boundary for the GitHub Pages room preview.

- It stores no conversations and has no database dependency.
- The browser sends bounded recent context; the gateway streams one model response and discards the request.
- The model key exists only in the host `EnvironmentFile` and is never a `NEXT_PUBLIC_*` value.
- Exact-origin checks, per-IP rate limits, a global concurrency limit, body limits, timeouts, and resource-capped systemd hardening are enabled.
- It implements only the room conversation contract. It does not claim to provide the full vNext commission, worker, draft, revision, or evidence workflow.

Keep non-secret runtime settings in `room-gateway.env` and put only
`MODEL_API_KEY=...` in a separate, mode-`0600` `model-key.env`. The bundled
systemd unit loads both files. Expose the loopback listener through an HTTPS
reverse proxy; never bind this process directly to a public plaintext port.

The Tencent deployment sample intentionally keeps `TRUST_PROXY=false`. The
dedicated Tailscale Funnel endpoint does not provide a trustworthy per-browser
address to this HTTP process, so the request budget is a conservative global
preview budget rather than a claimed per-user quota. Port `8443` should be used
for the public Funnel so an existing private Tailscale Serve route on `443`
remains private.
