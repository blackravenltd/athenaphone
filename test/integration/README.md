# Integration harness

Runs the real `SipClient` — the shipping JsSIP configuration, the shipping
transports, the shipping framing — against the Asterisk fixture, from Node.
**No device, no emulator, no Metro.**

```bash
cd test/asterisk && docker compose up -d && cd -
npm run test:integration
```

The suite skips itself with a clear message if the fixture is not reachable,
so it never fails merely because Docker is not running.

## How it works

React Native's UDP and TCP modules cannot run outside an app, which would
normally confine the SIP layer to a device. But the SIP layer is otherwise
plain JavaScript, so [`src/sip/transports/sockets.ts`](../../src/sip/transports/sockets.ts)
makes the sockets injectable: the app installs the React Native
implementations, and this harness installs Node's `dgram`, `net` and `tls`.

Everything above the socket is the code that ships. Only the bottom inch is
swapped, and it is swapped for something equally real.

React Native's own modules stay mocked by `jest.setup.js` — the app's code
imports them — but no SIP traffic goes through those mocks.

## What it covers

| Test | What it proves |
| --- | --- |
| Registers over UDP, TCP, TLS, WS | Each transport completes digest auth and gets `200 OK` |
| Bad password | Reported as `failed` with a `401`, rather than hanging |
| Unreachable server | Reported without throwing, and distinguishable from a rejection |
| Unregisters cleanly | Returns to `unregistered` |

Each transport registers in about 50ms. The whole suite runs in seconds, which
is the point: the same coverage by hand took an hour and produced three
misdiagnoses.

## Why this exists

Hand-driving the app to verify SIP behaviour proved slow and unreliable.
Taps landed on the wrong screen, results were misread, and the feedback loop
was minutes long. Every bug this project has found in its own SIP layer would
have been caught here in seconds.

## Limits

**No media.** `react-native-webrtc` is mocked, so this covers signalling only:
registration, authentication, transports and framing. Calls carrying audio
need a WebRTC stack under Node — `werift` is the candidate — and belong with
the Milliwatt tone assertion described in [`../asterisk/README.md`](../asterisk/README.md).

**WSS is not covered.** JsSIP's WebSocket transport uses the global
`WebSocket`, which offers no way to pass a CA, so it cannot verify the
fixture's self-signed certificate the way our own TLS transport can. Run with
`NODE_EXTRA_CA_CERTS=test/asterisk/tls/ca.crt` to cover it.

**TLS needs the fixture's CA.** Run `test/asterisk/scripts/generate-certs.sh`
with the address the harness dials — `127.0.0.1` by default, or whatever
`ATHENA_FIXTURE_HOST` is set to.
