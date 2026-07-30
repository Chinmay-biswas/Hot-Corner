# Watch Together Production Setup

The application now has graceful local fallbacks, but a public Vercel deployment needs the settings below for reliable multi-user calls and Drive conversion.

## 1. Shared realtime state

Add `WATCH_TOGETHER_REDIS_URL` in the server Vercel project. An Upstash Redis integration provides a `rediss://` connection string. The Socket.IO Redis adapter and room presence store use it so users connected to different Vercel function instances still receive chat, call signals, and roster updates.

## 2. TURN relay for video calls

STUN discovers direct peer routes, but it cannot relay traffic when a network firewall or NAT blocks that route. Configure one of the following server-side choices. Do not add a `VITE_WATCH_TOGETHER_ICE_SERVERS` value because Vite exposes it to every browser.

### Metered hosted TURN

1. Create a Metered TURN account and create a project/domain.
2. In the Metered Developers page, copy the Metered domain and secret key.
3. Add these Vercel server environment variables:

```text
METERED_TURN_DOMAIN=your-app.metered.live
METERED_TURN_SECRET_KEY=your-server-only-secret
METERED_TURN_CREDENTIAL_TTL_SECONDS=7200
```

The `/api/watch-together/ice-servers` route creates an expiring credential on the server, fetches its ICE list, and sends only that short-lived credential to an authenticated room member.

### Your own coturn relay

Configure coturn with `--use-auth-secret` and `--static-auth-secret=<secret>`, then add:

```text
WATCH_TOGETHER_TURN_URLS=turn:turn.example.com:80,turn:turn.example.com:80?transport=tcp,turns:turn.example.com:443?transport=tcp
WATCH_TOGETHER_TURN_SHARED_SECRET=the-same-coturn-static-auth-secret
```

The server creates a per-user HMAC-SHA1 credential that expires after two hours.

## 3. Browser-compatible Drive playback

Google Drive can preview MKV/HEVC files using Google-owned player code, but a website cannot control or synchronize that cross-origin preview. The app now handles this in two ways:

- Shared MP4 or WebM Drive files are used directly in the synchronized HTML video player.
- An unsupported Drive file can be converted by the room creator into an H.264/AAC MP4 through Cloudinary.

Add these server-only variables for conversion:

```text
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

If Cloudinary has restricted remote fetch domains enabled, allow `drive.usercontent.google.com`. The Drive file must be shared with the room before Cloudinary can retrieve it. Large files must fit the limits of the selected Cloudinary plan; no web application can safely force a multi-gigabyte MKV to transcode inside a Vercel function.

For already-created rooms that show the Drive preview warning, the room creator can use **Make synchronized copy** in that warning. New unsupported Drive files are prepared before the room is created.
