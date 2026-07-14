import Phaser from 'phaser';
import { PALETTE } from './config/palette';
import { ArenaScene } from './scenes/ArenaScene';
import { BootScene } from './scenes/BootScene';
import { GarageScene } from './scenes/GarageScene';
import { HudScene } from './scenes/HudScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultsScene } from './scenes/ResultsScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: PALETTE.deepSpace,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  render: {
    antialias: true,
  },
  input: {
    // Steering wheel + boost button need simultaneous touches.
    activePointers: 3,
  },
  scene: [BootScene, MenuScene, GarageScene, ArenaScene, HudScene, ResultsScene],
});

// Exposed for the headless smoke test (scripts/smoke.mjs) and debugging.
declare global {
  interface Window {
    __game: Phaser.Game;
  }
}
window.__game = game;
