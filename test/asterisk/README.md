# Asterisk test fixture

A disposable Asterisk 20 server for exercising AthenaPhone against something
real. It serves **all four transports at once** (UDP, TCP, TLS and
WebSocket), so one fixture covers everything the app supports.

> **Verified 2026-09-17** against Asterisk 20.6 on Ubuntu 24.04. All four
> transports answer SIP, the TLS chain verifies, both WebSocket listeners
> complete the `sip` sub-protocol handshake, the dialplan loads, and AMI
> accepts a login. AthenaPhone has registered over UDP and TCP and completed
> a call to extension 101 with two-way Opus over DTLS-SRTP.

## Why a fixture rather than a public provider

A test needs to assert on what the *server* saw, not just what the app drew on
screen. "The app displayed 1234" and "the PBX received 1234" are different
claims, and only the second proves DTMF crossed the wire. AMI gives us the
second.

## Verified state

| Check | Result |
| --- | --- |
| UDP 5060 | `SIP/2.0 401 Unauthorized`, challenging for auth, as it should |
| TCP 5060 | `SIP/2.0 401 Unauthorized` |
| TLS 5061 | TLSv1.2, chain verified against `tls/ca.crt`, then `401` |
| WS 8088 | `101 Switching Protocols`, `Sec-WebSocket-Protocol: sip` |
| WSS 8089 | `101 Switching Protocols`, `Sec-WebSocket-Protocol: sip` |
| Endpoints | `1001`, `1002`, `1003` and their auths loaded |
| Dialplan | 16 extensions in `athenaphone-test` |
| AMI 5038 | `Authentication accepted` |

## Quick start

```bash
cd test/asterisk

# The address the phone will reach this machine on. For a device on the LAN
# this is your LAN IP, not 127.0.0.1.
cp .env.example .env && $EDITOR .env

# The certificate must carry that same address, or TLS verification fails.
./scripts/generate-certs.sh 192.168.1.50

docker compose up --build
```

Then add an account in AthenaPhone:

| Field | Value |
| --- | --- |
| Username | `1001` |
| Password | `athenaphone` |
| Domain | the address from `.env` |
| Transport | any of UDP, TCP, TLS, WSS |
| WebSocket URI | `wss://<address>:8089/ws` (WS/WSS only) |
| CA certificate | contents of `tls/ca.crt` (TLS only) |

A second account, `1002`, exists for app-to-app calls and as somewhere for a
transfer to land.

## Test extensions

Each extension does one thing, so a test can assert on one thing.

| Ext | Behaviour | What it proves |
| --- | --- | --- |
| `100`, `*43` | Echo, audio and video | Round trip: send a known tone, assert it returns |
| `101` | Milliwatt 1004 Hz tone | **Deterministic audio assertion**, see below |
| `102` | Playback then hang up | Clean remote hangup, reported as `remote-hangup` |
| `103` | Read 4 DTMF digits, say them back | DTMF in both directions |
| `104` | Busy | 486, `endReason: 'busy'` |
| `105` | Congestion | 503 |
| `106` | Ring forever | No-answer timeout, and CANCEL rather than BYE |
| `107` | Ring 5s then answer | 180 observed before 200 OK |
| `108` | Decline | 603, `endReason: 'rejected'` |
| `109` | Music on hold | Hold and resume with media flowing |
| `110` | Transfer target | Blind transfer landed in the right place |
| `1001`–`1003` | Dial that endpoint | App-to-app calls, and inbound ringing |

### The Milliwatt trick

Extension `101` plays a precise **1004 Hz tone at 0 dBm**, forever. Decode the
received RTP, run an FFT, and assert the peak is at 1004 Hz at the expected
amplitude.

That matters because it turns "is there audio?" into a measurement. A test
that only checks for *some* RTP passes on silence, on comfort noise, and on a
half-negotiated stream. Checking for a specific frequency at a specific level
cannot.

## Asserting server-side over AMI

AMI is on port 5038, user `athenaphone-test`, secret `athenaphone`. The
dialplan raises `UserEvent`s a test can wait for:

- `DtmfReceived` with the digits extension `103` captured.
- `TransferLanded` when extension `110` answers.

## The WebRTC trap

**AthenaPhone's media is always WebRTC, whatever the SIP transport.**
react-native-webrtc offers DTLS-SRTP with ICE and rtcp-mux even over plain UDP
signalling, so the endpoint carries `webrtc = yes` on every transport; that
sets `use_avpf`, `media_encryption = dtls`, `ice_support` and `rtcp_mux`
together.

This is the most common reason a WebRTC-based softphone registers happily
against a conventional PBX and then has no audio: the server offers plain
RTP/AVP and the phone will not accept it.

Endpoint `1003` is deliberately **not** WebRTC, as a control. Calls to it
should register fine and then fail to establish media, which is the behaviour
to expect from a provider that only speaks plain RTP. Keep it: when the app
grows a plain-RTP path, `1003` is the test for it.

## UDP does not survive Docker Desktop on macOS

Registration over UDP succeeds and then dies a minute later, with Asterisk
logging the contact as Reachable and then Unreachable:

```
Contact 1001/... is now Reachable.    RTT: 156.906 msec
Contact 1001/... is now Unreachable.  RTT: 0.000 msec
```

Docker Desktop NATs the phone's UDP flow, so Asterisk sees the source as
`192.168.65.1:<port>` and replies there. That works while the NAT mapping is
alive, but the mapping is created by the phone's outbound packet and ages out;
after that, anything Asterisk initiates -- the qualify OPTIONS, an inbound
INVITE -- has nowhere to go, and the phone's next REGISTER gets no response.

This is an environment limitation, not an app defect. Options:

- **Use TCP or TLS** for testing on macOS. One long-lived connection, so there
  is no mapping to lose. This is what the verified call above used.
- **Use `network_mode: host`** on Linux, where it works properly, including in
  CI.
- **Run Asterisk natively** on the host if UDP specifically needs testing on
  macOS.

## Networking notes

SIP and RTP through Docker's NAT is the usual source of one-way audio. Asterisk
advertises an address in SDP, and if that is the container's bridge address
nothing outside can reply. `ASTERISK_EXTERNAL_IP` rewrites it.

On Linux you can sidestep this entirely with `network_mode: host`. On macOS and
Windows that is not available, so the ports are published instead, including
the RTP range, deliberately kept to 50 ports because publishing thousands of
UDP ports makes container start crawl.

## Things that bit during setup

Recorded because each one presents as something other than what it is.

**Asterisk is not in Debian.** It was removed from bookworm over unfixed CVEs;
only the sound-file packages remain. The base image is Ubuntu 24.04, which
carries Asterisk 20.6, the LTS this configuration targets.

**`chan_sip` silently disables SIP over WebSocket.** Loaded by default, it
registers the `sip` WebSocket sub-protocol before
`res_pjsip_transport_websocket` gets there, so that module declines to load and
WSS connections are refused, with nothing in the log but one line saying
"declined to load". It also binds UDP 5060 in competition with
`chan_pjsip`. `modules.conf` unloads it, which fixes both at once.

**Asterisk does not expand `${VAR}` in `pjsip.conf`.** Only the dialplan does.
`external_media_address` would be read literally, producing the classic
one-way-audio symptom. The entrypoint renders the file with `envsubst` first.

**Template inheritance is `[name](template)`, not `templates = name`.** Written
the wrong way the objects simply do not appear, with no error: `pjsip show
endpoints` just comes back short.

**A CA needs `keyUsage=keyCertSign`.** Without it, TLS stacks reject the chain
with "CA cert does not include key usage extension", which reads like a server
fault and is not.

## Security

The credentials here are trivial and the AMI account has full rights. This is
a development fixture. Do not expose it to a network you do not control.

`tls/` is gitignored: it holds private keys, throwaway or not.
