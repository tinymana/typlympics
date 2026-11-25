/**
 * Voice chat for a race room: up to four players, audio sent directly
 * between their browsers (WebRTC). The game server only relays the short
 * connection messages; it never hears anything.
 *
 * No relay server is used yet, only free public address helpers (STUN), so
 * a pair of players on strict networks may fail to connect. `peerState`
 * reports that so the room can show it.
 */
import { online, OnlineError, type VoiceSignal } from './online';

export type VoiceState = 'off' | 'asking' | 'on' | 'blocked' | 'unsupported';
export type PeerState = 'connecting' | 'connected' | 'failed';

const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
const POLL_FAST_MS = 1000;
const POLL_SLOW_MS = 3000;
/** A pair that has not connected after this long is shown as failed, and retried. */
const CONNECT_TIMEOUT_MS = 15000;

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  startedAt: number;
  /** Candidates that arrived before the remote description did. */
  waiting: RTCIceCandidateInit[];
  failed: boolean;
}

class Voice {
  state: VoiceState = 'off';
  micMuted = false;
  private token = '';
  private pin = '';
  private you = '';
  private stream: MediaStream | null = null;
  private peers = new Map<string, Peer>();
  private present = new Set<string>();
  private outbox: VoiceSignal[] = [];
  private timer: number | null = null;
  private busy = false;
  private listeners = new Set<() => void>();

  supported(): boolean {
    return typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Which room, if any, this browser is talking in. */
  roomPin(): string | null {
    return this.state === 'on' ? this.pin : null;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Asks for the microphone and joins the room's voice chat. Call from a key press or tap. */
  async join(token: string, pin: string, you: string): Promise<VoiceState> {
    if (this.state === 'on' || this.state === 'asking') return this.state;
    if (!this.supported()) return this.set('unsupported');
    this.set('asking');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch {
      return this.set('blocked');
    }
    this.token = token;
    this.pin = pin;
    this.you = you;
    this.micMuted = false;
    this.set('on');
    this.schedule(0);
    return this.state;
  }

  /** Mutes or unmutes your microphone. You still hear the others. */
  toggleMic(): void {
    if (this.state !== 'on' || !this.stream) return;
    this.micMuted = !this.micMuted;
    for (const track of this.stream.getAudioTracks()) track.enabled = !this.micMuted;
    this.changed();
  }

  /** Hangs up everywhere and releases the microphone. */
  leave(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.present.clear();
    this.outbox = [];
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    if (this.state === 'on' && this.token) void online.voice(this.token, this.pin, false, []).catch(() => undefined);
    this.set('off');
  }

  /** How the link to one other athlete is doing; null if they are not in voice. */
  peerState(id: string): PeerState | null {
    if (this.state !== 'on') return null;
    const peer = this.peers.get(id);
    if (!peer) return this.present.has(id) ? 'connecting' : null;
    if (peer.pc.connectionState === 'connected') return 'connected';
    return peer.failed ? 'failed' : 'connecting';
  }

  // ---------------------------------------------------------------- inside

  private set(state: VoiceState): VoiceState {
    this.state = state;
    this.changed();
    return state;
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  private schedule(ms: number): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.exchange(), ms);
  }

  /** One round with the server: say we are here, drop off messages, pick up ours. */
  private async exchange(): Promise<void> {
    if (this.state !== 'on' || this.busy) return;
    this.busy = true;
    const sending = this.outbox;
    this.outbox = [];
    try {
      const answer = await online.voice(this.token, this.pin, true, sending);
      if (this.state !== 'on') return;
      this.present = new Set(answer.peers);
      for (const id of [...this.peers.keys()]) if (!this.present.has(id)) this.drop(id);
      for (const signal of answer.signals) await this.receive(signal.from, signal.data);
      for (const id of answer.peers) {
        // The athlete with the smaller id places the call, so the two never call each other at once.
        if (!this.peers.has(id) && this.you < id) await this.call(id);
      }
      this.checkTimeouts();
      this.changed();
    } catch (e) {
      // Kicked from the room, or signed out: voice ends with it.
      if (e instanceof OnlineError && ['not_member', 'no_room', 'signed_out'].includes(e.code)) {
        this.busy = false;
        this.leave();
        return;
      }
      this.outbox = sending.concat(this.outbox);
    } finally {
      this.busy = false;
    }
    if (this.state !== 'on') return;
    const settled = [...this.present].every((id) => this.peers.get(id)?.pc.connectionState === 'connected');
    this.schedule(settled && this.outbox.length === 0 ? POLL_SLOW_MS : POLL_FAST_MS);
  }

  private open(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.style.display = 'none';
    document.body.appendChild(audio);
    const peer: Peer = { pc, audio, startedAt: performance.now(), waiting: [], failed: false };
    for (const track of this.stream?.getTracks() ?? []) pc.addTrack(track, this.stream as MediaStream);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.outbox.push({ to: id, data: { candidate: e.candidate.toJSON() } });
    };
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      void audio.play().catch(() => undefined);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') peer.failed = true;
      this.changed();
    };
    this.peers.set(id, peer);
    return peer;
  }

  private async call(id: string): Promise<void> {
    const peer = this.open(id);
    try {
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      this.outbox.push({ to: id, data: { description: peer.pc.localDescription?.toJSON() } });
    } catch {
      this.drop(id);
    }
  }

  private async receive(from: string, data: Record<string, unknown>): Promise<void> {
    try {
      const description = data['description'] as RTCSessionDescriptionInit | undefined;
      if (description?.type === 'offer') {
        // A fresh call replaces whatever was there (a retry after a failure).
        if (this.peers.has(from)) this.drop(from);
        const peer = this.open(from);
        await peer.pc.setRemoteDescription(description);
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        this.outbox.push({ to: from, data: { description: peer.pc.localDescription?.toJSON() } });
        await this.flush(peer);
      } else if (description?.type === 'answer') {
        const peer = this.peers.get(from);
        if (!peer || peer.pc.signalingState !== 'have-local-offer') return;
        await peer.pc.setRemoteDescription(description);
        await this.flush(peer);
      } else if (data['candidate']) {
        const peer = this.peers.get(from);
        if (!peer) return;
        const candidate = data['candidate'] as RTCIceCandidateInit;
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(candidate);
        else peer.waiting.push(candidate);
      }
    } catch {
      // A bad or late message; the timeout below retries the whole link if it matters.
    }
  }

  private async flush(peer: Peer): Promise<void> {
    for (const candidate of peer.waiting.splice(0)) await peer.pc.addIceCandidate(candidate).catch(() => undefined);
  }

  /** Links that never came up are marked failed; the caller's side then tries again. */
  private checkTimeouts(): void {
    const now = performance.now();
    for (const [id, peer] of this.peers) {
      const state = peer.pc.connectionState;
      if (state === 'connected') {
        peer.failed = false;
        peer.startedAt = now;
        continue;
      }
      if (now - peer.startedAt < CONNECT_TIMEOUT_MS && state !== 'failed') continue;
      if (this.you < id) {
        this.drop(id);
        void this.call(id).then(() => {
          const again = this.peers.get(id);
          if (again) again.failed = true;
        });
      } else {
        peer.failed = true;
      }
    }
  }

  private drop(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peer.audio.srcObject = null;
    peer.audio.remove();
    this.peers.delete(id);
  }
}

export const voice = new Voice();

// Test hook, like the others the browser tests use.
(window as unknown as { __typlympicsVoice?: Voice }).__typlympicsVoice = voice;
