/** Player-like bot names — the snake.io "alive arena" trick. */
const PREFIXES = [
  'Turbo', 'Drift', 'Nitro', 'Neon', 'Ghost', 'Blaze', 'Shadow', 'Hyper',
  'Pixel', 'Retro', 'Chrome', 'Vortex', 'Rocket', 'Slick', 'Apex', 'Dash',
];
const SUFFIXES = [
  'Kid', 'Queen', 'King', 'Wolf', 'Fox', 'Rider', 'Racer', 'Demon',
  'Hawk', 'Viper', 'Ace', 'Boss', 'Punk', 'Ninja', 'Zed', 'Nova',
];

export function randomBotName(): string {
  const p = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const s = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  const num = Math.random() < 0.45 ? String(Math.floor(Math.random() * 99) + 1) : '';
  const sep = Math.random() < 0.3 ? '_' : '';
  return `${p}${sep}${s}${num}`;
}

/** N unique names. */
export function botNames(count: number): string[] {
  const names = new Set<string>();
  while (names.size < count) names.add(randomBotName());
  return [...names];
}
