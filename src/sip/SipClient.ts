import { UA, WebSocketInterface } from 'jssip';
import type { Socket } from 'jssip/lib/Socket';
import type {
  IncomingMessageEvent,
  IncomingRTCSessionEvent,
  OutgoingMessageEvent,
  RTCSessionEvent,
  UAConfiguration,
} from 'jssip/lib/UA';
import type {
  EndEvent,
  IncomingDTMFEvent,
  OutgoingDTMFEvent,
  RTCSession,
} from 'jssip/lib/RTCSession';
import { mediaDevices, MediaStream } from 'react-native-webrtc';

import {
  defaultPortFor,
  type Call,
  type CallEndReason,
  type CallState,
  type RegistrationStatus,
  type SipAccount,
} from '../types';
import { TypedEmitter } from '../utils/emitter';
import { uuidv4 } from '../utils/id';
import { bareUri, toSipUri } from '../utils/sipUri';
import { StreamTransport } from './transports/StreamTransport';
import { UdpTransport } from './transports/UdpTransport';

export interface SipClientEvents {
  'transport:state': { connected: boolean; attempts?: number; reason?: string };
  registration: RegistrationStatus;
  'call:new': Call;
  'call:update': Call;
  'call:ended': Call;
  'call:streams': {
    callId: string;
    local?: MediaStream;
    remote?: MediaStream;
  };
  'dtmf:received': { callId: string; tone: string };
  'message:received': { from: string; body: string };
  error: { message: string; cause?: unknown };
}

/** Everything we track per in-flight call leg. */
interface ManagedSession {
  session: RTCSession;
  call: Call;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
}

export interface PlaceCallOptions {
  video?: boolean;
  extraHeaders?: string[];
}

/**
 * Wraps a single JsSIP `UA` and presents a call-centric API to the rest of
 * the app.
 *
 * Responsibilities kept here: UA lifecycle, registration, and translating
 * JsSIP's session events into our `Call` model. Everything platform-specific
 * -- CallKit/ConnectionService, audio routing, ringtones -- lives in
 * `src/services` and reacts to the events this class emits.
 *
 * Transport is pluggable. JsSIP only ships a WebSocket socket, but its
 * transport layer accepts anything implementing its `Socket` interface, so
 * `udp` accounts get `UdpTransport` and reach ordinary SIP servers on 5060.
 */
export class SipClient extends TypedEmitter<SipClientEvents> {
  private ua?: UA;
  private account?: SipAccount;
  private password?: string;
  private readonly sessions = new Map<string, ManagedSession>();
  private registration: RegistrationStatus = { state: 'unregistered' };
  /** Set while `stop()` is unwinding, so teardown is not treated as a fault. */
  private shuttingDown = false;

  get currentAccount(): SipAccount | undefined {
    return this.account;
  }

  get registrationStatus(): RegistrationStatus {
    return this.registration;
  }

  get calls(): Call[] {
    return [...this.sessions.values()].map(managed => managed.call);
  }

  isConnected(): boolean {
    return this.ua?.isConnected() ?? false;
  }

  // ---------------------------------------------------------------- lifecycle

  /**
   * Bring up a UA for `account`. Replaces any existing UA, so this doubles as
   * "apply edited account settings".
   */
  async start(account: SipAccount, password: string): Promise<void> {
    await this.stop();

    this.shuttingDown = false;
    this.account = account;
    this.password = password;

    const socket = createSocket(account);

    const config: UAConfiguration = {
      sockets: [socket],
      uri: `sip:${account.username}@${account.domain}`,
      password,
      display_name: account.displayName,
      authorization_user: account.authorizationUser,
      register: account.autoRegister,
      register_expires: account.registerExpires,
      session_timers: false,
      user_agent: 'AthenaPhone',
      connection_recovery_min_interval: 2,
      connection_recovery_max_interval: 30,
    };

    if (account.outboundProxy) {
      // Pre-loading the route set sends every request to the proxy while
      // keeping the request-URI pointed at the real target.
      config.registrar_server = `sip:${account.domain}`;
      config.use_preloaded_route = true;
    }

    const ua = new UA(config);
    this.ua = ua;
    this.attachUaHandlers(ua);
    ua.start();
  }

  /** Tear down the UA, terminating any live calls first. */
  async stop(): Promise<void> {
    if (!this.ua) {
      return;
    }
    this.shuttingDown = true;

    for (const managed of [...this.sessions.values()]) {
      this.releaseStreams(managed);
      if (!managed.session.isEnded()) {
        try {
          managed.session.terminate();
        } catch {
          // Already gone; nothing to unwind.
        }
      }
    }
    this.sessions.clear();

    try {
      this.ua.stop();
    } finally {
      (
        this.ua as unknown as { removeAllListeners: () => void }
      ).removeAllListeners();
      this.ua = undefined;
      this.setRegistration({ state: 'unregistered' });
    }
  }

  register(): void {
    this.ua?.register();
  }

  unregister(): void {
    this.ua?.unregister({ all: true });
  }

  /** Re-REGISTER after a network change, without rebuilding the UA. */
  refreshRegistration(): void {
    if (this.ua?.isConnected()) {
      this.ua.register();
    }
  }

  // -------------------------------------------------------------- outbound

  /**
   * Place a call. Resolves with the new `Call` once the INVITE is on the wire;
   * progress arrives as `call:update` events.
   */
  async placeCall(
    target: string,
    options: PlaceCallOptions = {},
  ): Promise<Call> {
    const { ua, account } = this;
    if (!ua || !account) {
      throw new Error('No SIP account is active');
    }
    if (!ua.isConnected()) {
      throw new Error('Not connected to the SIP server');
    }

    const wantsVideo = options.video ?? false;
    const uri = toSipUri(target, account.domain);
    const localStream = await this.captureLocalMedia(wantsVideo);

    const call: Call = {
      id: uuidv4(),
      accountId: account.id,
      direction: 'outbound',
      state: 'connecting',
      remoteUri: bareUri(uri),
      hasVideo: wantsVideo,
      muted: false,
      videoEnabled: wantsVideo,
      speakerOn: wantsVideo, // video calls start on the loudspeaker
      createdAt: Date.now(),
      localStreamId: localStream.id,
    };

    const session = ua.call(uri, {
      mediaStream: localStream as unknown as MediaStream,
      pcConfig: { iceServers: account.iceServers },
      rtcOfferConstraints: {
        offerToReceiveAudio: true,
        offerToReceiveVideo: wantsVideo,
      },
      extraHeaders: [
        ...(account.extraHeaders ?? []),
        ...(options.extraHeaders ?? []),
      ],
    } as never);

    const managed: ManagedSession = { session, call, localStream };
    this.sessions.set(call.id, managed);
    this.attachSessionHandlers(managed);

    this.emit('call:new', call);
    this.emit('call:streams', { callId: call.id, local: localStream });
    return call;
  }

  // --------------------------------------------------------------- inbound

  /** Accept a ringing inbound call, optionally upgrading to video. */
  async answerCall(callId: string, withVideo?: boolean): Promise<void> {
    const managed = this.require(callId);
    const wantsVideo = withVideo ?? managed.call.hasVideo;
    const localStream = await this.captureLocalMedia(wantsVideo);

    managed.localStream = localStream;
    this.patch(managed, {
      state: 'answering',
      videoEnabled: wantsVideo,
      localStreamId: localStream.id,
    });
    this.emit('call:streams', { callId, local: localStream });

    managed.session.answer({
      mediaStream: localStream as unknown as MediaStream,
      pcConfig: { iceServers: this.account?.iceServers ?? [] },
      rtcAnswerConstraints: {
        offerToReceiveAudio: true,
        offerToReceiveVideo: wantsVideo,
      },
    } as never);
  }

  /** Decline a ringing inbound call. 486 tells the caller we are busy. */
  rejectCall(callId: string, statusCode: 486 | 603 = 486): void {
    const managed = this.sessions.get(callId);
    managed?.session.terminate({
      status_code: statusCode,
      reason_phrase: statusCode === 486 ? 'Busy Here' : 'Decline',
    });
  }

  // ------------------------------------------------------------ in-call ops

  hangup(callId: string): void {
    const managed = this.sessions.get(callId);
    if (!managed) {
      return;
    }
    try {
      managed.session.terminate();
    } catch {
      // Session raced us to termination; the 'ended' handler will clean up.
    }
  }

  hangupAll(): void {
    for (const callId of this.sessions.keys()) {
      this.hangup(callId);
    }
  }

  setHold(callId: string, held: boolean): void {
    const managed = this.require(callId);
    if (held) {
      managed.session.hold();
    } else {
      managed.session.unhold();
    }
  }

  setMuted(callId: string, muted: boolean): void {
    const managed = this.require(callId);
    if (muted) {
      managed.session.mute({ audio: true });
    } else {
      managed.session.unmute({ audio: true });
    }
    this.patch(managed, { muted });
  }

  /**
   * Toggle the local camera track. This only stops sending video; it does not
   * renegotiate the session, so the far end keeps its slot for us.
   */
  setVideoEnabled(callId: string, enabled: boolean): void {
    const managed = this.require(callId);
    for (const track of managed.localStream?.getVideoTracks() ?? []) {
      track.enabled = enabled;
    }
    this.patch(managed, { videoEnabled: enabled });
  }

  /** Flip between the front and back cameras mid-call. */
  switchCamera(callId: string): void {
    const managed = this.sessions.get(callId);
    for (const track of managed?.localStream?.getVideoTracks() ?? []) {
      // _switchCamera is react-native-webrtc's native-side helper.
      (track as unknown as { _switchCamera: () => void })._switchCamera();
    }
  }

  /**
   * Add video to a call that started as audio-only, by capturing a camera
   * track and re-INVITEing the far end.
   */
  async upgradeToVideo(callId: string): Promise<void> {
    const managed = this.require(callId);
    if (managed.call.hasVideo) {
      return;
    }

    const videoStream = await mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user' },
    });
    const [videoTrack] = videoStream.getVideoTracks();
    if (!videoTrack) {
      throw new Error('No camera available');
    }

    const pc = managed.session.connection as unknown as {
      addTrack: (track: unknown, stream: unknown) => void;
    };
    pc.addTrack(videoTrack, managed.localStream);
    managed.localStream?.addTrack(videoTrack);

    managed.session.renegotiate({
      rtcOfferConstraints: { offerToReceiveVideo: true },
    } as never);

    this.patch(managed, { hasVideo: true, videoEnabled: true });
  }

  sendDtmf(callId: string, tones: string): void {
    const managed = this.require(callId);
    managed.session.sendDTMF(tones, {
      transportType: (this.account?.dtmfMode === 'info'
        ? 'INFO'
        : 'RFC2833') as never,
      duration: 160,
      interToneGap: 80,
    });
  }

  /** Blind transfer: hand the far end to `target` and drop out. */
  blindTransfer(callId: string, target: string): void {
    const managed = this.require(callId);
    const domain = this.account?.domain ?? '';
    managed.session.refer(toSipUri(target, domain));
    this.patch(managed, { endReason: 'transferred' });
  }

  /**
   * Attended transfer: connect the party on `callId` to the party we are
   * already talking to on `consultCallId`, then leave both.
   */
  attendedTransfer(callId: string, consultCallId: string): void {
    const managed = this.require(callId);
    const consult = this.require(consultCallId);
    managed.session.refer(consult.session.remote_identity.uri, {
      replaces: consult.session,
    });
    this.patch(managed, { endReason: 'transferred' });
  }

  getCall(callId: string): Call | undefined {
    return this.sessions.get(callId)?.call;
  }

  getLocalStream(callId: string): MediaStream | undefined {
    return this.sessions.get(callId)?.localStream;
  }

  getRemoteStream(callId: string): MediaStream | undefined {
    return this.sessions.get(callId)?.remoteStream;
  }

  // ----------------------------------------------------------------- internals

  private attachUaHandlers(ua: UA): void {
    ua.on('connecting', ({ attempts }) => {
      this.emit('transport:state', { connected: false, attempts });
    });

    ua.on('connected', () => {
      this.emit('transport:state', { connected: true });
      if (this.account?.autoRegister) {
        this.setRegistration({ state: 'registering' });
      }
    });

    ua.on('disconnected', ({ error, reason }) => {
      this.emit('transport:state', { connected: false, reason });
      if (!this.shuttingDown) {
        this.setRegistration({
          state: error ? 'failed' : 'unregistered',
          reason: reason ?? (error ? 'Transport error' : undefined),
        });
      }
    });

    ua.on('registered', ({ response }) => {
      this.setRegistration({
        state: 'registered',
        registeredAt: Date.now(),
        statusCode: response?.status_code,
      });
    });

    ua.on('unregistered', () => {
      if (!this.shuttingDown) {
        this.setRegistration({ state: 'unregistered' });
      }
    });

    ua.on('registrationFailed', ({ cause, response }) => {
      this.setRegistration({
        state: 'failed',
        reason: cause ?? 'Registration failed',
        statusCode: response?.status_code,
      });
    });

    ua.on('newRTCSession', (event: RTCSessionEvent) => {
      // Outbound sessions are already tracked by placeCall().
      if (event.originator === 'local') {
        return;
      }
      this.handleIncomingSession(event as IncomingRTCSessionEvent);
    });

    ua.on(
      'newMessage',
      (event: IncomingMessageEvent | OutgoingMessageEvent) => {
        if (event.originator === 'remote') {
          this.emit('message:received', {
            from: bareUri(event.message.remote_identity.uri.toString()),
            body: event.request.body ?? '',
          });
        }
      },
    );
  }

  private handleIncomingSession(event: IncomingRTCSessionEvent): void {
    const account = this.account;
    if (!account) {
      return;
    }

    const { session, request } = event;
    // An INVITE offering a video m-line means the caller wants video.
    const offeredVideo = /^m=video /m.test(request.body ?? '');

    const call: Call = {
      id: uuidv4(),
      accountId: account.id,
      direction: 'inbound',
      state: 'ringing',
      remoteUri: bareUri(session.remote_identity.uri.toString()),
      remoteDisplayName: session.remote_identity.display_name || undefined,
      hasVideo: offeredVideo,
      muted: false,
      videoEnabled: false,
      speakerOn: offeredVideo,
      createdAt: Date.now(),
    };

    const managed: ManagedSession = { session, call };
    this.sessions.set(call.id, managed);
    this.attachSessionHandlers(managed);
    this.emit('call:new', call);
  }

  private attachSessionHandlers(managed: ManagedSession): void {
    const { session, call } = managed;

    session.on('peerconnection', ({ peerconnection }) => {
      this.bindRemoteTrack(managed, peerconnection);
    });

    // Inbound sessions build their peer connection during answer(), so the
    // event above may already have fired by the time we get here.
    if (session.connection) {
      this.bindRemoteTrack(managed, session.connection);
    }

    session.on('progress', () => {
      if (call.direction === 'outbound') {
        this.patch(managed, { state: 'ringing' });
      }
    });

    session.on('accepted', () => {
      this.patch(managed, { state: 'active', answeredAt: Date.now() });
    });

    session.on('confirmed', () => {
      this.patch(managed, {
        state: 'active',
        answeredAt: call.answeredAt ?? Date.now(),
      });
    });

    session.on('hold', ({ originator }) => {
      this.patch(managed, {
        state: originator === 'local' ? 'held' : 'remote-held',
      });
    });

    session.on('unhold', () => {
      this.patch(managed, { state: 'active' });
    });

    session.on('newDTMF', (event: IncomingDTMFEvent | OutgoingDTMFEvent) => {
      if (event.originator === 'remote') {
        this.emit('dtmf:received', { callId: call.id, tone: event.dtmf.tone });
      }
    });

    session.on('ended', event => {
      this.finish(managed, 'ended', this.reasonFor(event));
    });

    session.on('failed', event => {
      this.finish(managed, 'failed', this.reasonFor(event));
    });
  }

  /** Surface the far end's media as soon as the first remote track lands. */
  private bindRemoteTrack(
    managed: ManagedSession,
    peerconnection: unknown,
  ): void {
    const pc = peerconnection as {
      addEventListener: (
        type: string,
        listener: (event: never) => void,
      ) => void;
    };

    pc.addEventListener('track', (event: never) => {
      const { streams } = event as unknown as { streams: MediaStream[] };
      const [remoteStream] = streams;
      if (!remoteStream || managed.remoteStream?.id === remoteStream.id) {
        return;
      }
      managed.remoteStream = remoteStream;
      this.patch(managed, {
        remoteStreamId: remoteStream.id,
        hasVideo:
          managed.call.hasVideo || remoteStream.getVideoTracks().length > 0,
      });
      this.emit('call:streams', {
        callId: managed.call.id,
        local: managed.localStream,
        remote: remoteStream,
      });
    });
  }

  /** Map a JsSIP termination cause onto our `CallEndReason`. */
  private reasonFor(event: EndEvent): CallEndReason {
    switch (event.cause) {
      case 'Busy':
        return 'busy';
      case 'Rejected':
        return 'rejected';
      case 'Canceled':
        return 'cancelled';
      case 'No Answer':
      case 'Expires':
        return 'no-answer';
      case 'Unavailable':
      case 'Not Found':
        return 'unavailable';
      case 'Connection Error':
      case 'Request Timeout':
      case 'RTP Timeout':
        return 'network-error';
      case 'Terminated':
        return event.originator === 'local' ? 'local-hangup' : 'remote-hangup';
      default:
        return event.originator === 'local' ? 'local-hangup' : 'error';
    }
  }

  private finish(
    managed: ManagedSession,
    state: Extract<CallState, 'ended' | 'failed'>,
    reason: CallEndReason,
  ): void {
    if (managed.call.state === 'ended' || managed.call.state === 'failed') {
      return;
    }
    this.releaseStreams(managed);
    this.sessions.delete(managed.call.id);

    const ended: Call = {
      ...managed.call,
      state,
      endedAt: Date.now(),
      // A transfer sets endReason ahead of the BYE it causes; keep it.
      endReason:
        managed.call.endReason === 'transferred' ? 'transferred' : reason,
    };
    managed.call = ended;
    this.emit('call:ended', ended);
  }

  /** Stop camera and microphone capture so the hardware indicator clears. */
  private releaseStreams(managed: ManagedSession): void {
    for (const track of managed.localStream?.getTracks() ?? []) {
      track.stop();
    }
    managed.localStream?.release?.();
    managed.localStream = undefined;
    managed.remoteStream = undefined;
  }

  private async captureLocalMedia(video: boolean): Promise<MediaStream> {
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: video ? { facingMode: 'user' } : false,
    });
    return stream as MediaStream;
  }

  private patch(managed: ManagedSession, changes: Partial<Call>): void {
    managed.call = { ...managed.call, ...changes };
    this.emit('call:update', managed.call);
  }

  private setRegistration(status: RegistrationStatus): void {
    this.registration = status;
    this.emit('registration', status);
  }

  private require(callId: string): ManagedSession {
    const managed = this.sessions.get(callId);
    if (!managed) {
      throw new Error(`No such call: ${callId}`);
    }
    return managed;
  }
}

/** The app runs a single UA; this is it. */
export const sipClient = new SipClient();

/**
 * Build the JsSIP socket for an account's transport.
 *
 * This is the only place that knows which transports exist; everything above
 * it just has a `Socket`.
 */
function createSocket(account: SipAccount): Socket {
  const host = account.server?.trim() || account.domain;
  const port = account.port ?? defaultPortFor(account.transport);

  switch (account.transport) {
    case 'udp':
      return new UdpTransport(host, port ?? 5060) as unknown as Socket;

    case 'tcp':
      return new StreamTransport(host, port ?? 5060, false) as unknown as Socket;

    case 'tls':
      return new StreamTransport(
        host,
        port ?? 5061,
        true,
        account.tlsCaPem,
      ) as unknown as Socket;

    case 'ws':
    case 'wss': {
      // RFC 7118 registers no port and the listener can live at any path, so
      // there is nothing sensible to synthesise here.
      const uri = account.wsUri?.trim();
      if (!uri) {
        throw new Error(
          'This account needs a WebSocket URI, e.g. wss://pbx.example.com:8089/ws',
        );
      }
      return new WebSocketInterface(uri);
    }
  }
}
