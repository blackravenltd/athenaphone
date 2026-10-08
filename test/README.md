# Tests against live servers

Both suites run the app's real SIP stack from Node: the shipping `SipClient`,
transports and framing, with Node's `dgram`, `net` and `tls` swapped in for
the React Native sockets. No phone, emulator or Metro. Each skips itself,
rather than failing, when its server is not reachable.

## Asterisk: `npm run test:integration`

Registration over UDP, TCP, TLS and WS against the fixture in
[`asterisk/`](asterisk/README.md), plus a bad password, an unreachable
server and a clean unregister.

```bash
cd test/asterisk && docker compose up -d && cd -
npm run test:integration
```

TLS needs the fixture's CA: run `asterisk/scripts/generate-certs.sh` with the
address the harness dials (`127.0.0.1`, or `ATHENA_FIXTURE_HOST`).

## AthenaSIP: `npm run test:athenasip`

AthenaPhone's part of the combined suite in the athenasip repository
(`test/suite/run.sh`), which starts the node and exports its details as
`ATHENA_INTEROP_*`. This script never starts or stops a server.

- Registration over UDP, TCP, TLS, WS and WSS; TLS refused against the wrong
  CA; RFC 5626 outbound parameters; 401 on a bad password; unregister; the
  node's 555 for RFC 8599 push parameters; re-registration after a node
  restart (when `ATHENA_SUITE_RESTART_CMD` is set).
- Calls between subscribers 1003 and 1004 through the node: media both ways,
  hold and resume, DTMF over INFO, BYE from each end, CANCEL, and 486
  reported as busy.

Calls use [werift](https://github.com/shinyoshiaki/werift-webrtc) as WebRTC
and a fake microphone that sends RTP; see `athenasip/media.ts` for the three
things werift needs that the phone's libwebrtc does not. RFC 4733 DTMF is not
covered, as werift has no DTMF sender.

Results go to `$ATHENA_SUITE_RESULTS/phone/`: `summary.json`, the SIP traces
and the Jest reports. The script exits 0 only if nothing failed.
