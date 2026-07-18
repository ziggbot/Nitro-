import Phaser from 'phaser';
import QRCode from 'qrcode';
import { PALETTE, hexToCss } from '../config/palette';
import { TRACKS } from '../config/tracks';
import { fuelById } from '../config/fuels';
import { loadSave, persistSave } from '../meta/SaveGame';
import { NetRoom, type NetPlayer } from '../net/room';
import { bodyStyle, clearScene, fitToScreen, isNarrow, makeButton, makePanel, titleStyle } from '../ui/widgets';

/**
 * Multiplayer lobby. Host: shows a QR code + room code, lists joiners,
 * picks the track and starts the race for everyone. Guest: joins via
 * scanned link and waits for the green light.
 */
export class LobbyScene extends Phaser.Scene {
  private mode: 'host' | 'join' = 'host';
  private joinCode = '';
  private room?: NetRoom;
  private players: NetPlayer[] = [];
  private status = '';
  private trackIndex = 0;
  private qrKey = '';
  private starting = false;

  constructor() {
    super('lobby');
  }

  init(data: { mode: 'host' | 'join'; code?: string }): void {
    this.mode = data.mode;
    this.joinCode = data.code ?? '';
    this.players = [];
    this.status = this.mode === 'host' ? 'Setting up room…' : `Joining ${this.joinCode}…`;
    this.trackIndex = 0;
    this.starting = false;
  }

  create(): void {
    const save = loadSave();
    if (!save.playerName) {
      save.playerName = `Racer${10 + Math.floor(Math.random() * 90)}`;
      persistSave(save);
    }
    const name = save.playerName;
    const fuel = fuelById(save.selectedFuel).id;

    this.room = new NetRoom();
    NetRoom.claim(this.room);
    this.room.onPlayers = (players) => {
      this.players = players;
      this.status = '';
      this.buildUi();
    };
    this.room.onError = (message) => {
      this.status = `⚠ ${message}`;
      this.buildUi();
    };

    if (this.mode === 'host') {
      const code = NetRoom.randomCode();
      this.room.host(code, name, fuel, () => {
        this.status = '';
        this.makeQr(code);
        this.buildUi();
      });
    } else {
      this.room.onStart = (msg) => {
        this.starting = true;
        this.scene.start('race', {
          trackId: msg.trackId,
          seed: msg.seed,
          network: { room: this.room, players: msg.players },
        });
      };
      this.room.join(this.joinCode, name, fuel);
    }

    this.buildUi();
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
      // Leaving without racing → tear the room down.
      if (!this.starting) this.room?.destroy();
    });
  }

  private onResize(): void {
    this.buildUi();
  }

  private makeQr(code: string): void {
    const url = `${location.origin}${location.pathname}#join=${code}`;
    this.qrKey = `qr-${code}`;
    QRCode.toDataURL(url, { width: 260, margin: 1 }).then((dataUrl) => {
      if (!this.textures.exists(this.qrKey)) {
        this.textures.once(`addtexture-${this.qrKey}`, () => this.buildUi());
        this.textures.addBase64(this.qrKey, dataUrl);
      } else {
        this.buildUi();
      }
    });
  }

  private buildUi(): void {
    if (!this.scene.isActive()) return;
    clearScene(this);
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(w / 2, h / 2, w, h, PALETTE.deepSpace);

    const start = this.children.list.length;
    const narrow = isNarrow(this);
    const DW = narrow ? 420 : 960;
    const DH = narrow ? 760 : 560;
    const cx = DW / 2;

    this.add.text(cx, 44, '👥 MULTIPLAYER', titleStyle(narrow ? 30 : 36)).setOrigin(0.5);

    if (this.mode === 'host') {
      this.add
        .text(cx, 88, `Room code: ${this.room?.roomCode ?? '…'}`, titleStyle(22, hexToCss(PALETTE.gold)))
        .setOrigin(0.5);
      this.add
        .text(cx, 118, 'Friends scan the QR (or open the link) to join', bodyStyle(12, hexToCss(PALETTE.uiDim)))
        .setOrigin(0.5);

      if (this.qrKey && this.textures.exists(this.qrKey)) {
        const qr = this.add.image(narrow ? cx : 250, narrow ? 260 : 280, this.qrKey);
        qr.setDisplaySize(narrow ? 220 : 250, narrow ? 220 : 250);
      }

      // Player list.
      const listX = narrow ? cx : 640;
      const listY = narrow ? 400 : 170;
      makePanel(this, listX, listY + 70, narrow ? 380 : 420, 170, 0.7);
      this.add.text(listX - (narrow ? 175 : 195), listY, 'DRIVERS', titleStyle(15, hexToCss(PALETTE.uiText)));
      this.players.forEach((p, i) => {
        const pFuel = fuelById(p.fuel);
        this.add.text(
          listX - (narrow ? 175 : 195),
          listY + 28 + i * 26,
          `${pFuel.emoji} ${p.name}${p.id === this.room?.myId ? ' (you)' : ''}`,
          bodyStyle(14, hexToCss(pFuel.color)),
        );
      });
      if (this.players.length < 2) {
        this.add
          .text(listX - (narrow ? 175 : 195), listY + 28, 'Waiting for friends to scan…', bodyStyle(13, hexToCss(PALETTE.uiDim)))
          .setY(listY + 28 + this.players.length * 26);
      }

      // Track picker + start.
      const track = TRACKS[this.trackIndex];
      const pickY = narrow ? 560 : 380;
      this.add.text(cx, pickY - 24, 'TRACK', bodyStyle(11, hexToCss(PALETTE.uiDim))).setOrigin(0.5);
      this.add.text(cx, pickY, `🏁 ${track.name}`, titleStyle(19, hexToCss(PALETTE.cyan))).setOrigin(0.5);
      makeButton(this, cx - 140, pickY, 40, 44, '‹', () => this.cycleTrack(-1));
      makeButton(this, cx + 140, pickY, 40, 44, '›', () => this.cycleTrack(1));

      makeButton(this, cx, narrow ? 640 : 460, narrow ? 340 : 300, 54, '🚦 START RACE', () => this.startRace(), PALETTE.lime);
    } else {
      this.add
        .text(cx, 100, `Room: ${this.joinCode}`, titleStyle(22, hexToCss(PALETTE.gold)))
        .setOrigin(0.5);
      makePanel(this, cx, 260, narrow ? 380 : 420, 190, 0.7);
      this.add.text(cx - (narrow ? 175 : 195), 180, 'DRIVERS', titleStyle(15, hexToCss(PALETTE.uiText)));
      this.players.forEach((p, i) => {
        const pFuel = fuelById(p.fuel);
        this.add.text(
          cx - (narrow ? 175 : 195),
          210 + i * 26,
          `${pFuel.emoji} ${p.name}${p.id === this.room?.myId ? ' (you)' : ''}`,
          bodyStyle(14, hexToCss(pFuel.color)),
        );
      });
      this.add
        .text(cx, narrow ? 420 : 400, this.players.length > 0 ? 'Waiting for the host to start…' : 'Connecting…', bodyStyle(14, hexToCss(PALETTE.uiDim)))
        .setOrigin(0.5);
    }

    if (this.status) {
      this.add.text(cx, narrow ? 700 : 505, this.status, bodyStyle(13, hexToCss(PALETTE.red))).setOrigin(0.5);
    }
    makeButton(this, cx, narrow ? 736 : 536, 200, 36, '← BACK', () => this.scene.start('menu'));

    fitToScreen(this, start, DW, DH);
  }

  private cycleTrack(dir: number): void {
    this.trackIndex = (this.trackIndex + dir + TRACKS.length) % TRACKS.length;
    this.buildUi();
  }

  private startRace(): void {
    if (!this.room) return;
    const seed = Math.floor(Math.random() * 2 ** 31);
    const trackId = TRACKS[this.trackIndex].id;
    this.room.startRace(trackId, seed);
    this.starting = true;
    this.scene.start('race', {
      trackId,
      seed,
      network: { room: this.room, players: this.room.players },
    });
  }
}
