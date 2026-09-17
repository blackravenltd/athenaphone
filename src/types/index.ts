/**
 * Core domain types for AthenaPhone.
 *
 * These are deliberately transport-agnostic: the SIP layer currently speaks
 * SIP over WebSocket via JsSIP, but nothing above `src/sip` should know that.
 */

/**
 * How a SIP account reaches its server. See `src/sip/transports`.
 *
 * `udp` is the one every SIP server speaks, `tcp` avoids the datagram size
 * limit, and `tls` is the only one that keeps credentials off the wire.
 * `ws`/`wss` reach the WebSocket listeners that PBXs expose for WebRTC.
 */
export type SipTransport = 'udp' | 'tcp' | 'tls' | 'ws' | 'wss';

/**
 * Default ports for the transports that have a registered one.
 *
 * RFC 3261 assigns 5060 to UDP and TCP and 5061 to TLS, so those can be
 * defaulted safely. SIP over WebSocket (RFC 7118) has **no** registered port
 * -- it rides on whatever the deployment chose, and every implementation
 * picks differently (Asterisk 8089, FreeSWITCH 7443, Kamailio 443,
 * AthenaSIP 9500). Guessing one would be wrong more often than right, so
 * `ws`/`wss` accounts must state their URI.
 */
export const DEFAULT_PORTS: Record<'udp' | 'tcp' | 'tls', number> = {
  udp: 5060,
  tcp: 5060,
  tls: 5061,
};

/** The port to dial for `transport`, or undefined when the user must say. */
export function defaultPortFor(transport: SipTransport): number | undefined {
  return transport === 'ws' || transport === 'wss'
    ? undefined
    : DEFAULT_PORTS[transport];
}

/** Media direction negotiated for a session. */
export type MediaKind = 'audio' | 'video';

/** DTMF signalling method. RFC 2833 is the interoperable default. */
export type DtmfMode = 'rfc2833' | 'info';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * A provisioned SIP identity. `password` is never persisted in this object --
 * it lives in the keychain and is merged in at registration time.
 * See `src/services/CredentialStore.ts`.
 */
export interface SipAccount {
  id: string;
  /** Label shown in the UI, e.g. "Work PBX". */
  name: string;
  /** Auth user; usually the extension number. */
  username: string;
  /** SIP domain / realm, e.g. "pbx.example.com". */
  domain: string;
  /** Distinct auth user, when the PBX separates it from the AOR user part. */
  authorizationUser?: string;
  /** Name shown to the far end in the From header. */
  displayName?: string;
  transport: SipTransport;
  /**
   * Full WebSocket URI for `ws`/`wss`, e.g. "wss://pbx.example.com:7443/ws".
   * Unused for `udp`, which dials `server`/`port` instead.
   */
  wsUri?: string;
  /**
   * Server host for `udp`/`tcp`/`tls`. Defaults to `domain` when unset, which
   * is right whenever the SIP domain and the server are the same name.
   */
  server?: string;
  /** Server port. Defaults to `DEFAULT_PORTS[transport]`. */
  port?: number;
  /**
   * PEM for a private CA, for `tls` against a server with a self-signed
   * certificate -- which is what AthenaSIP ships with.
   */
  tlsCaPem?: string;
  /** Route all requests via this proxy instead of the domain. */
  outboundProxy?: string;
  /** REGISTER refresh interval, seconds. */
  registerExpires: number;
  /** Register on app start and keep the registration refreshed. */
  autoRegister: boolean;
  enabled: boolean;
  iceServers: IceServerConfig[];
  dtmfMode: DtmfMode;
  /** Prefer video on outgoing calls placed from this account. */
  videoEnabled: boolean;
  /** Send a CRLF keep-alive every N seconds to hold NAT bindings open. */
  keepAliveInterval: number;
  /** Additional SIP headers sent on every outgoing INVITE. */
  extraHeaders?: string[];
  /** Voicemail dial string, used by the dialer's long-press on "1". */
  voicemailNumber?: string;
  createdAt: number;
}

export type RegistrationState =
  | 'unregistered'
  | 'registering'
  | 'registered'
  | 'failed';

export interface RegistrationStatus {
  state: RegistrationState;
  /** Populated when `state` is 'failed'. */
  reason?: string;
  /** Epoch ms of the last successful REGISTER. */
  registeredAt?: number;
  /** SIP response code from the last REGISTER attempt. */
  statusCode?: number;
}

export type CallDirection = 'inbound' | 'outbound';

/**
 * Lifecycle of a single call leg. Mirrors the RFC 3261 dialog states we
 * actually care about in the UI.
 */
export type CallState =
  | 'idle'
  | 'connecting' // outbound: INVITE sent, no response yet
  | 'ringing' // outbound: got 180/183. inbound: INVITE received
  | 'answering' // inbound: 200 OK sent, awaiting ACK
  | 'active'
  | 'held' // we put the far end on hold
  | 'remote-held' // the far end put us on hold
  | 'ended'
  | 'failed';

/** Why a call finished, for history and for the UI's end-of-call message. */
export type CallEndReason =
  | 'local-hangup'
  | 'remote-hangup'
  | 'rejected'
  | 'busy'
  | 'no-answer'
  | 'cancelled'
  | 'transferred'
  | 'network-error'
  | 'unavailable'
  | 'error';

export interface Call {
  /** Stable local id; also the CallKeep UUID. */
  id: string;
  accountId: string;
  direction: CallDirection;
  state: CallState;
  /** Bare target, e.g. "1001" or "alice@example.com". */
  remoteUri: string;
  /** Far-end display name when the PBX supplies one. */
  remoteDisplayName?: string;
  /** True when video was negotiated in either direction. */
  hasVideo: boolean;
  muted: boolean;
  /** Local camera is capturing and being sent. */
  videoEnabled: boolean;
  /** Audio is routed to the loudspeaker rather than the earpiece. */
  speakerOn: boolean;
  createdAt: number;
  /** Epoch ms the call was answered; undefined until then. */
  answeredAt?: number;
  endedAt?: number;
  endReason?: CallEndReason;
  /** react-native-webrtc MediaStream ids, resolved to streams in the store. */
  localStreamId?: string;
  remoteStreamId?: string;
  /** Set while this leg is a participant in a local conference. */
  conferenceId?: string;
}

export interface CallHistoryEntry {
  id: string;
  accountId: string;
  direction: CallDirection;
  remoteUri: string;
  remoteDisplayName?: string;
  hasVideo: boolean;
  startedAt: number;
  /** Seconds of connected media; 0 for unanswered calls. */
  durationSec: number;
  /** Inbound calls that were never answered. */
  missed: boolean;
  endReason?: CallEndReason;
}

export interface Contact {
  id: string;
  displayName: string;
  /** SIP URIs or numbers this contact can be reached on. */
  numbers: { label: string; value: string }[];
  /** Base64 avatar or a local file URI. */
  avatarUri?: string;
  favorite: boolean;
  /** True when sourced from the device address book rather than local storage. */
  external: boolean;
}

export type AudioRoute = 'earpiece' | 'speaker' | 'bluetooth' | 'headset';
