import { PluginMetadata } from '@/plugins/plugin'

const selector = '.custom-navbar-search .launch-bar input.input'
let userInteracted = false

const patchInput = (input: HTMLInputElement) => {
  if (input.matches(selector)) {
    input.type = 'search'
    // Safari may restore focus before it reclassifies the input.
    if (!userInteracted && document.activeElement === input) {
      setTimeout(() => {
        if (!userInteracted && document.activeElement === input) {
          input.blur()
        }
      }, 0)
    }
  }
}

const patchTree = (root: Element) => {
  if (root instanceof HTMLInputElement) {
    patchInput(root)
  }
  root.querySelectorAll<HTMLInputElement>('input.input').forEach(patchInput)
}

export const plugin: PluginMetadata = {
  name: 'customNavbar.safariAutofill',
  displayName: '自定义顶栏 - Safari 密码填充修正',
  setup: () => {
    const markInteraction = () => {
      userInteracted = true
    }
    document.addEventListener('pointerdown', markInteraction, { capture: true, once: true })
    document.addEventListener('keydown', markInteraction, { capture: true, once: true })
    document.addEventListener('focusin', event => {
      if (event.target instanceof HTMLInputElement) {
        patchInput(event.target)
      }
    })
    patchTree(document.documentElement)
    new MutationObserver(records => {
      records.forEach(({ addedNodes }) => {
        addedNodes.forEach(node => {
          if (node instanceof Element) {
            patchTree(node)
          }
        })
      })
    }).observe(document.documentElement, { childList: true, subtree: true })
  },
}
