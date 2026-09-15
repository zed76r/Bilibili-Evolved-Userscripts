import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initLodash } from '../../src/client/init-lodash.ts'
import { createUserscriptsStorage } from '../../src/client/userscripts-runtime.ts'

test('keeps a non-configurable lodash global and completes initialization', () => {
  const lodash = { identity: value => value }
  globalThis._ = lodash
  globalThis.window = {}
  Object.defineProperty(window, '_', { value: lodash, configurable: false })
  initLodash()
  assert.equal(window.lodash, lodash)
  assert.equal(window._, lodash)
  assert.equal(Object.getOwnPropertyDescriptor(window, '_').get, undefined)
})

test('retains the upstream getter for a configurable lodash global', () => {
  globalThis.window = { _: globalThis._ }
  initLodash()
  assert.equal(typeof Object.getOwnPropertyDescriptor(window, '_').get, 'function')
  assert.equal(window.lodash, globalThis._)
})

test('preloads persisted settings, snapshots writes and preserves write/delete order', async () => {
  const persisted = new Map([['settings', { enabled: false }]])
  const operations = []
  const api = {
    listValues: async () => [...persisted.keys()],
    getValue: async key => persisted.get(key),
    setValue: async (key, value) => {
      operations.push('set')
      persisted.set(key, value)
    },
    deleteValue: async key => {
      operations.push('delete')
      persisted.delete(key)
    },
  }
  const storage = await createUserscriptsStorage(api, assert.fail)
  assert.deepEqual(storage.getValue('settings'), { enabled: false })
  const value = { enabled: true }
  storage.setValue('settings', value)
  value.enabled = false
  assert.deepEqual(storage.getValue('settings'), { enabled: true })
  storage.getValue('settings').enabled = false
  await storage.flush()
  assert.deepEqual(persisted.get('settings'), { enabled: true })
  const reloaded = await createUserscriptsStorage(api, assert.fail)
  assert.deepEqual(reloaded.getValue('settings'), { enabled: true })
  storage.deleteValue('settings')
  storage.setValue('settings', { enabled: false })
  await storage.flush()
  assert.deepEqual(operations, ['set', 'delete', 'set'])
  assert.deepEqual(persisted.get('settings'), { enabled: false })
})

test('does not initialize an empty cache when storage read fails', async () => {
  await assert.rejects(
    createUserscriptsStorage(
      {
        listValues: async () => ['settings'],
        getValue: async () => {
          throw new Error('read failed')
        },
      },
      assert.fail,
    ),
    /read failed/,
  )
})

test('reports write failure and continues processing later writes', async () => {
  const errors = []
  const persisted = new Map()
  const storage = await createUserscriptsStorage(
    {
      listValues: async () => [],
      setValue: async (key, value) => {
        if (value === 'bad') throw new Error('write failed')
        persisted.set(key, value)
      },
    },
    error => errors.push(error),
  )
  storage.setValue('settings', 'bad')
  storage.setValue('settings', 'good')
  await storage.flush()
  assert.equal(errors.length, 1)
  assert.equal(persisted.get('settings'), 'good')
})

test('feature sandbox calls base64 DOM functions with the Window receiver', async () => {
  globalThis.window = Object.create(globalThis)
  globalThis.unsafeWindow = window
  window.btoa = function (value) {
    assert.equal(this, window, 'Window.btoa requires the real Window receiver')
    return Buffer.from(value).toString('base64')
  }
  window.atob = function (value) {
    assert.equal(this, window, 'Window.atob requires the real Window receiver')
    return Buffer.from(value, 'base64').toString()
  }
  window.getComputedStyle = function () {
    assert.equal(this, window, 'DOM helpers require the real Window receiver')
    return { color: 'blue' }
  }
  const { loadFeatureCode } = await import('../../src/core/external-input/load-feature-code.ts')
  assert.deepEqual(loadFeatureCode('({ value: atob(btoa("style")) })'), { value: 'style' })
  assert.equal(loadFeatureCode('getComputedStyle({}).color'), 'blue')
})


test('publishes granted network API to the component sandbox in Userscripts', async () => {
  globalThis.GM_info = { scriptHandler: 'Userscripts' }
  globalThis.GM = {
    listValues: async () => [],
    getValue: async () => undefined,
  }
  const request = () => ({ abort() {} })
  globalThis.GM_xmlhttpRequest = request
  globalThis.window = {}
  const { initUserscriptsRuntime } = await import('../../src/client/userscripts-runtime.ts')
  await initUserscriptsRuntime()
  assert.equal(window.GM_xmlhttpRequest, request)
})
