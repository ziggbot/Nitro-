import Peer, { type DataConnection } from 'peerjs';

/**
 * P2P multiplayer room over WebRTC (PeerJS public cloud for signaling —
 * no server of our own). The host's device is the hub: guests connect
 * directly to it, the host relays their state to everyone else.
 */

export interface NetPlayer {
  id: string;
  name: string;
  fuel: string;
}

export interface StateMsg {
  t: 'state';
  id: string;
  x: number;
  y: number;
  h: number;
  lap: number;
  prog: number;
  boost: boolean;
  /** Race-relative finish time in ms, 0 = not finished. */
  fin: number;
}

export type NetMsg =
  | { t: 'hello'; name: string; fuel: string }
  | { t: 'lobby'; players: NetPlayer[] }
  | { t: 'start'; trackId: string; seed: number; players: NetPlayer[] }
  | StateMsg;

const PREFIX = 'nitro-io-race-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Only one live room per page; hosting/joining again replaces it. */
let activeRoom: NetRoom | null = null;

export class NetRoom {
  peer!: Peer;
  isHost = false;
  roomCode = '';
  myId = '';
  players: NetPlayer[] = [];
  private conns: DataConnection[] = [];
  private hostConn?: DataConnection;

  onPlayers?: (players: NetPlayer[]) => void;
  onState?: (msg: StateMsg) => void;
  onStart?: (msg: { trackId: string; seed: number; players: NetPlayer[] }) => void;
  onError?: (message: string) => void;

  static randomCode(): string {
    let code = '';
    for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return code;
  }

  static claim(room: NetRoom): void {
    activeRoom?.destroy();
    activeRoom = room;
  }

  host(code: string, myName: string, myFuel: string, onReady: () => void): void {
    this.isHost = true;
    this.roomCode = code;
    this.peer = new Peer(PREFIX + code);
    this.peer.on('open', (id) => {
      this.myId = id;
      this.players = [{ id, name: myName, fuel: myFuel }];
      this.onPlayers?.(this.players);
      onReady();
    });
    this.peer.on('connection', (conn) => {
      conn.on('data', (data) => this.handleAsHost(conn, data as NetMsg));
      conn.on('close', () => {
        this.conns = this.conns.filter((c) => c !== conn);
        this.players = this.players.filter((p) => p.id !== conn.peer);
        this.broadcast({ t: 'lobby', players: this.players });
        this.onPlayers?.(this.players);
      });
      this.conns.push(conn);
    });
    this.peer.on('error', (err) => this.onError?.(describePeerError(err)));
  }

  join(code: string, myName: string, myFuel: string): void {
    this.isHost = false;
    this.roomCode = code;
    this.peer = new Peer();
    this.peer.on('open', (id) => {
      this.myId = id;
      const conn = this.peer.connect(PREFIX + code, { reliable: false });
      this.hostConn = conn;
      conn.on('open', () => conn.send({ t: 'hello', name: myName, fuel: myFuel }));
      conn.on('data', (data) => this.handleAsGuest(data as NetMsg));
      conn.on('close', () => this.onError?.('Connection to the host was lost'));
    });
    this.peer.on('error', (err) => this.onError?.(describePeerError(err)));
  }

  private handleAsHost(conn: DataConnection, msg: NetMsg): void {
    if (msg.t === 'hello') {
      if (!this.players.some((p) => p.id === conn.peer)) {
        this.players.push({ id: conn.peer, name: msg.name.slice(0, 14), fuel: msg.fuel });
      }
      this.broadcast({ t: 'lobby', players: this.players });
      this.onPlayers?.(this.players);
    } else if (msg.t === 'state') {
      // Relay to every other guest, deliver locally.
      for (const c of this.conns) {
        if (c !== conn && c.open) c.send(msg);
      }
      this.onState?.(msg);
    }
  }

  private handleAsGuest(msg: NetMsg): void {
    if (msg.t === 'lobby') {
      this.players = msg.players;
      this.onPlayers?.(this.players);
    } else if (msg.t === 'start') {
      this.players = msg.players;
      this.onStart?.(msg);
    } else if (msg.t === 'state') {
      this.onState?.(msg);
    }
  }

  /** Host only: launch the race for everyone. */
  startRace(trackId: string, seed: number): void {
    this.broadcast({ t: 'start', trackId, seed, players: this.players });
  }

  /** Send own car state (host broadcasts, guest sends to host for relay). */
  sendState(msg: StateMsg): void {
    if (this.isHost) this.broadcast(msg);
    else if (this.hostConn?.open) this.hostConn.send(msg);
  }

  private broadcast(msg: NetMsg): void {
    for (const c of this.conns) {
      if (c.open) c.send(msg);
    }
  }

  destroy(): void {
    try {
      this.peer?.destroy();
    } catch {
      // already gone
    }
    if (activeRoom === this) activeRoom = null;
  }
}

function describePeerError(err: { type?: string }): string {
  switch (err.type) {
    case 'peer-unavailable':
      return 'Room not found — check the code or ask the host to restart';
    case 'unavailable-id':
      return 'Room code already in use — try hosting again';
    case 'network':
    case 'server-error':
      return 'Could not reach the matchmaking service — check your connection';
    default:
      return `Connection error (${err.type ?? 'unknown'})`;
  }
}
