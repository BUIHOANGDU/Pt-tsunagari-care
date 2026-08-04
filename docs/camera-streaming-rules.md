# Camera Streaming RTDB Rules Proposal

This document is a production rules proposal only. It was not deployed by
Codex.

## Paths

Camera streaming uses Firebase Realtime Database for WebRTC signaling only.
The publisher is the existing Fall Detection Camera MVP page, not a separate
camera-host page:

- `camera_hosts/{hostDeviceId}`
- `camera_sessions/{sessionId}`
- `camera_sessions/{sessionId}/hostCandidates`
- `camera_sessions/{sessionId}/viewerCandidates`

Do not store video frames, images, audio, recordings, raw `MediaStream` objects,
private keys, LINE tokens, device tokens, service account JSON, or TURN
credentials in these paths.

## Recommended Direction

Production should use Firebase Auth or backend-minted custom tokens so rules can
separate:

- Fall Detection Camera host write access to its own
  `camera_hosts/{hostDeviceId}` record.
- Fall Detection Camera host read access to sessions for its own
  `hostDeviceId`.
- Family Viewer write access only to its own `camera_sessions/{sessionId}`.
- Candidate writes scoped to the side that owns them.
- Limited read access to the current session only.

Avoid global database rules such as:

```json
{
  ".read": true,
  ".write": true
}
```

## Sketch

The exact claims depend on the chosen auth model, but the rules should resemble:

```json
{
  "rules": {
    "camera_hosts": {
      "$hostDeviceId": {
        ".read": "auth != null",
        ".write": "auth != null && auth.token.hostDeviceId == $hostDeviceId"
      }
    },
    "camera_sessions": {
      ".indexOn": ["hostDeviceId"],
      "$sessionId": {
        ".read": "auth != null && (auth.token.sessionId == $sessionId || auth.token.hostDeviceId == data.child('hostDeviceId').val())",
        ".write": "auth != null && (auth.token.sessionId == $sessionId || auth.token.hostDeviceId == newData.child('hostDeviceId').val())",
        "hostCandidates": {
          ".write": "auth != null && auth.token.hostDeviceId == data.parent().child('hostDeviceId').val()"
        },
        "viewerCandidates": {
          ".write": "auth != null && auth.token.sessionId == $sessionId"
        }
      }
    }
  }
}
```

## MVP Limitation

The current frontend MVP assumes the deployed RTDB rules allow the required
signaling reads/writes. If production rules block these paths, the Fall
Detection Camera host and Family Viewer will show unavailable/failed states
until rules are configured.

STUN is configured for discovery, but TURN is not configured. Some 4G/5G or NAT
networks may not connect until a real TURN service is added.
