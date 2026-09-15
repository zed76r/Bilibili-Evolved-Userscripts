/** A page-only endpoint. This function is serialized: keep it self-contained. */
export const installPageEndpoint = (channelId: string) => {
  const channel = document.getElementById(channelId)
  const page = window as any
  const methods = new Set([
    'getCurrentTime',
    'getDuration',
    'getVolume',
    'setVolume',
    'volume',
    'isMuted',
    'isMute',
    'seek',
    'play',
    'pause',
    'getLightOff',
    'setLightOff',
    'getPlaybackRate',
    'setPlaybackRate',
  ])
  const subscriptions = new Map<string, { player: any; type: string; callback: () => void }>()
  const player = () => page.player || page.playerRaw
  const videoId = () => {
    const current = player()
    let input: Record<string, unknown> = {}
    try {
      input =
        current?.getManifest?.() ??
        current?.getVideoMessage?.() ??
        current?.getUserParams?.()?.input ??
        {}
    } catch {
      // The player may exist before its manifest is ready.
    }
    return Object.fromEntries(
      ['aid', 'cid', 'bvid'].map(key => {
        const value = page[key] ?? input[key]
        return [
          key,
          typeof value === 'string' || typeof value === 'number' ? String(value) : undefined,
        ]
      }),
    )
  }
  channel.addEventListener('request', () => {
    try {
      const { op, name, args = [], id } = JSON.parse(channel.getAttribute('request'))
      const current = player()
      if (current && typeof current.on === 'function' && typeof current.off === 'function') {
        subscriptions.forEach(subscription => {
          if (subscription.player !== current) {
            subscription.player.off(subscription.type, subscription.callback)
            current.on(subscription.type, subscription.callback)
            subscription.player = current
          }
        })
      }
      let value: unknown
      if (op === 'state') {
        value = { ...videoId(), player: Boolean(current) }
      } else if (op === 'has') {
        value = methods.has(name) && typeof current?.[name] === 'function'
      } else if (op === 'call' && methods.has(name) && typeof current?.[name] === 'function') {
        if (
          !Array.isArray(args) ||
          args.some(arg => !['number', 'boolean', 'string'].includes(typeof arg))
        ) {
          throw new Error('Invalid player arguments')
        }
        value = current[name](...args)
        // Native play() may return a Promise. Do not serialize player objects.
        if (value && typeof (value as Promise<unknown>).then === 'function') {
          ;(value as Promise<unknown>).catch(() => undefined)
          value = undefined
        }
      } else if (op === 'subscribe' && ['play', 'pause'].includes(name) && current) {
        const type = page.nano?.EventType?.[name === 'play' ? 'Player_Play' : 'Player_Pause']
        if (!type || typeof current.on !== 'function' || typeof current.off !== 'function') {
          throw new Error('Player events unavailable')
        }
        const callback = () =>
          channel.dispatchEvent(new CustomEvent('notification', { detail: id }))
        subscriptions.set(id, { player: current, type, callback })
        current.on(type, callback)
        value = true
      } else if (op === 'unsubscribe') {
        const subscription = subscriptions.get(id)
        if (subscription) {
          subscription.player.off(subscription.type, subscription.callback)
          subscriptions.delete(id)
        }
        value = true
      } else {
        throw new Error('Unsupported page API')
      }
      channel.setAttribute('response', JSON.stringify({ ok: true, value }))
    } catch {
      channel.setAttribute('response', JSON.stringify({ ok: false }))
    }
  })
  channel.setAttribute('ready', 'true')
}

/** Content-world facade: only public video IDs and a fixed player API cross worlds. */
export const createUserscriptsPageBridge = (doc: Document = document) => {
  const channel = doc.createElement('span')
  channel.id = `be-userscripts-${crypto.randomUUID()}`
  const script = doc.createElement('script')
  script.textContent = `;(${installPageEndpoint.toString()})(${JSON.stringify(channel.id)})`
  const root = doc.head || doc.documentElement
  root.append(channel, script)
  // Both worlds retain the detached channel. RPC cannot cause body mutation loops.
  script.remove()
  channel.remove()
  if (channel.getAttribute('ready') !== 'true') {
    return undefined
  }
  const request = (message: Record<string, unknown>): any => {
    const previous = channel.getAttribute('request')
    channel.setAttribute('request', JSON.stringify(message))
    channel.removeAttribute('response')
    channel.dispatchEvent(new Event('request'))
    const response = JSON.parse(channel.getAttribute('response') || '{}')
    channel.setAttribute('request', previous || '')
    if (!response.ok) {
      throw new Error('Userscripts 页面 API 不可用')
    }
    return response.value
  }
  const callbacks = new Map<string, () => void>()
  channel.addEventListener('notification', (event: CustomEvent<string>) =>
    callbacks.get(event.detail)?.(),
  )
  let nextId = 0
  const subscriptions = new Map<() => void, Map<string, string>>()
  const off = (type: string, callback: () => void) => {
    const entries = subscriptions.get(callback)
    const id = entries?.get(type)
    if (id) {
      request({ op: 'unsubscribe', id })
      callbacks.delete(id)
      entries.delete(type)
      if (entries.size === 0) {
        subscriptions.delete(callback)
      }
    }
  }
  const on = (type: string, callback: () => void, once = false) => {
    if (!['play', 'pause'].includes(type)) {
      throw new Error(`Userscripts 不支持播放器事件: ${type}`)
    }
    off(type, callback)
    const id = String(++nextId)
    request({ op: 'subscribe', name: type, id })
    const entries = subscriptions.get(callback) || new Map()
    entries.set(type, id)
    subscriptions.set(callback, entries)
    callbacks.set(id, () => {
      if (once) {
        off(type, callback)
      }
      callback()
    })
  }
  const eventMethods = {
    on,
    off,
    once: (type: string, callback: () => void) => on(type, callback, true),
  }
  const nativePlayer = new Proxy(eventMethods, {
    get(target, name: string) {
      if (Object.hasOwn(target, name)) {
        return target[name]
      }
      if (request({ op: 'has', name })) {
        return (...args: unknown[]) => request({ op: 'call', name, args })
      }
      return undefined
    },
  })
  return {
    getState: () =>
      request({ op: 'state' }) as { aid?: string; cid?: string; bvid?: string; player: boolean },
    player: nativePlayer,
    nano: { EventType: { Player_Play: 'play', Player_Pause: 'pause' } },
  }
}

export const initUserscriptsPage = () => {
  if (GM_info.scriptHandler !== 'Userscripts') {
    return
  }
  const bridge = createUserscriptsPageBridge()
  if (!bridge) {
    console.warn('[Bilibili Evolved Userscripts] 页面通信不可用，保留 DOM 功能。')
    return
  }
  for (const name of ['aid', 'cid', 'bvid', 'player', 'playerRaw', 'nano']) {
    let fallback: unknown
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => {
        const state = bridge.getState()
        if (name === 'nano') {
          return bridge.nano
        }
        if (name === 'player' || name === 'playerRaw') {
          return state.player ? bridge.player : undefined
        }
        return state[name] ?? fallback
      },
      set: value => {
        fallback = value
      },
    })
  }
}
