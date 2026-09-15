/** The asynchronous storage API exposed by Safari Userscripts. */
export interface UserscriptsStorage {
  listValues(): Promise<string[]>
  getValue(key: string): Promise<unknown>
  setValue(key: string, value: unknown): Promise<unknown>
  deleteValue(key: string): Promise<unknown>
}

declare const GM: UserscriptsStorage

/** Snapshot values before handing them to asynchronous extension storage. */
const snapshot = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value))

/** Preload storage before the core's synchronous settings modules are evaluated. */
export const createUserscriptsStorage = async (
  api: UserscriptsStorage,
  onWriteError: (error: unknown) => void,
) => {
  const values = new Map(
    await Promise.all(
      (await api.listValues()).map(async key => [key, await api.getValue(key)] as const),
    ),
  )
  let pending = Promise.resolve()
  const enqueue = (write: () => Promise<unknown>) => {
    pending = pending.then(write).then(() => undefined, onWriteError)
  }
  return {
    getValue: <T>(key: string, defaultValue?: T): T =>
      snapshot(values.has(key) ? (values.get(key) as T) : defaultValue),
    setValue: (key: string, value: unknown) => {
      const saved = snapshot(value)
      values.set(key, saved)
      enqueue(() => api.setValue(key, saved))
    },
    deleteValue: (key: string) => {
      values.delete(key)
      enqueue(() => api.deleteValue(key))
    },
    flush: () => pending,
  }
}

export const initUserscriptsRuntime = async () => {
  if (GM_info.scriptHandler !== 'Userscripts') {
    return
  }
  const storage = await createUserscriptsStorage(GM, error => {
    console.error('[Bilibili Evolved Userscripts] Failed to save settings:', error)
  })
  // This is the isolated content world's Window, NOT access to page JavaScript.
  // Selected player APIs are installed separately after <head> is ready.
  // Do not bridge privileged GM APIs into the untrusted page world.
  Object.assign(window, {
    unsafeWindow: window,
    GM_getValue: storage.getValue,
    GM_setValue: storage.setValue,
    GM_deleteValue: storage.deleteValue,
    GM_info,
    GM_xmlhttpRequest,
  })
  console.info('[Bilibili Evolved Userscripts] Content-world GM APIs initialized.')
}
