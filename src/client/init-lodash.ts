/** Keep the legacy alias only when the script manager allows redefining it. */
export const initLodash = () => {
  window.lodash = _
  // Some script managers expose lodash as a non-configurable global.
  // The deprecated alias is optional; keep the existing property in that case.
  if (Object.getOwnPropertyDescriptor(window, '_')?.configurable !== false) {
    Object.defineProperty(window, '_', {
      get() {
        console.warn('window._ is deprecated, please use window.lodash instead.')
        return window.lodash
      },
    })
  }
}
