/**
 * Shared state between the on-screen touch controls (drawn by the HUD)
 * and the PlayerDriver that consumes them — the snake.io scheme:
 * a steering-wheel joystick in one bottom corner, hold-to-boost in the other.
 */
export const touchControls = {
  /** Finger currently on the wheel. */
  steering: false,
  /** World-space direction the wheel is pointing (radians). */
  angle: 0,
  /** Boost button held. */
  boostHeld: false,
  /** Fire button tapped (consumed by the race scene). */
  firePressed: false,
};

export function resetTouchControls(): void {
  touchControls.steering = false;
  touchControls.boostHeld = false;
  touchControls.firePressed = false;
}
