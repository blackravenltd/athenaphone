# Asterisk test fixture

A disposable Asterisk 20 serving UDP, TCP and WS on 5060/8088 and TLS and WSS
on 5061/8089, with single-purpose test extensions and AMI. Development only:
the credentials are trivial and AMI has full rights.

## Start it

```bash
cd test/asterisk
cp .env.example .env && $EDITOR .env    # the address the phone reaches you on
./scripts/generate-certs.sh <that address>
docker compose up --build
```

Then add an account in AthenaPhone: user `1001` (or `1002`), password
`athenaphone`, domain the address from `.env`, any transport. For TLS, paste
`tls/ca.crt` into the account's CA certificate field. `tls/` is gitignored.

## Extensions

| Ext | Does | Proves |
| --- | --- | --- |
| `100`, `*43` | Echo, audio and video | Round trip |
| `101` | 1004 Hz tone at 0 dBm | Audio can be measured, not just detected |
| `102` | Plays, then hangs up | Remote hang-up |
| `103` | Reads 4 DTMF digits back | DTMF both ways; raises AMI `DtmfReceived` |
| `104` | Busy | 486 |
| `105` | Congestion | 503 |
| `106` | Rings forever | No answer, CANCEL |
| `107` | Rings 5 s, answers | 180 before 200 |
| `108` | Declines | 603 |
| `109` | Music on hold | Hold and resume |
| `110` | Transfer target | Blind transfer; raises AMI `TransferLanded` |
| `1001`-`1003` | That endpoint | App-to-app calls |

AMI is on 5038, user `athenaphone-test`, secret `athenaphone`.

`1003` is deliberately not WebRTC: it offers plain RTP, which the app refuses
with 488. It is the test for a plain-RTP path if the app ever grows one.

## Gotchas

- **UDP dies on Docker Desktop for macOS.** It registers, then the NAT
  mapping ages out and the server can no longer reach the phone. Use TCP or
  TLS on a Mac; `network_mode: host` fixes it on Linux.
- **One-way audio** usually means `ASTERISK_EXTERNAL_IP` in `.env` is wrong.
- `chan_sip` is unloaded in `modules.conf`, because it silently stops WSS
  working and fights `chan_pjsip` for UDP 5060.
- `pjsip.conf` does not expand `${VAR}`; the entrypoint runs `envsubst` on
  the template first.
