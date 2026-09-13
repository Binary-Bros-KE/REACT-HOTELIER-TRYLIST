/**
 * A focused <input type="number"> silently changes value on mouse-wheel
 * scroll in every major browser — scroll the page while the cursor happens
 * to be resting over a focused amount field and "5000" can quietly become
 * "4999.98", easy to miss until a total doesn't add up. Blocking the wheel
 * event's default action while it targets a number input disables that
 * browser behavior sitewide, with no per-input change needed. Also blocks
 * the page from scrolling for that one wheel tick — an accepted, standard
 * tradeoff for this fix (the alternative, unfocusing the field, is worse:
 * it interrupts whatever the user was doing with it).
 */
export function installNumberInputWheelGuard(): void {
  window.addEventListener(
    'wheel',
    (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === 'number') {
        event.preventDefault()
      }
    },
    { passive: false },
  )
}
