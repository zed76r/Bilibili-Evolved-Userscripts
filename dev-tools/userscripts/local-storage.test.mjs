import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(
  readFileSync(new URL('../../src/core/local-storage.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  },
).outputText

const requestCases = [
  ['setItem', api => api.setItem('key', 'value')],
  ['getItem', api => api.getItem('key')],
  ['removeItem', api => api.removeItem('key')],
  ['keys', api => api.keys('prefix')],
  ['clear', api => api.clear('prefix')],
]

const setup = ({ select = async () => null, postMessage = () => {} } = {}) => {
  const listeners = new Map()
  const sentMessages = []
  let randomId = 0
  const iframe = {
    contentWindow: {
      postMessage(message, origin) {
        sentMessages.push({ message, origin })
        postMessage(message, origin)
      },
    },
  }
  const window = {
    addEventListener(name, listener) {
      listeners.set(name, listener)
    },
  }
  const exports = {}
  const testState = {}
  const modules = {
    './spin-query': { select: async () => select(iframe) },
    './utils': {
      createPostHook() {},
      deleteValue(items, predicate) {
        const index = items.findIndex(predicate)
        if (index >= 0) items.splice(index, 1)
      },
      getRandomId: () => `id-${++randomId}`,
    },
  }
  vm.runInNewContext(`${source}\n__testState.messageListeners = messageListeners;`, {
    exports,
    require: name => modules[name],
    window,
    __testState: testState,
  })
  return {
    api: exports.crossOriginLocalStorage,
    listenerCount: () => testState.messageListeners.length,
    listeners,
    sentMessages,
  }
}

const settleWithin = promise =>
  Promise.race([
    promise.then(
      value => ({ status: 'resolved', value }),
      error => ({ status: 'rejected', error }),
    ),
    new Promise(resolve => setTimeout(() => resolve({ status: 'pending' }), 25)),
  ])

const captureUnhandledRejections = async callback => {
  const reasons = []
  const onUnhandledRejection = reason => reasons.push(reason)
  process.on('unhandledRejection', onUnhandledRejection)
  try {
    await callback(reasons)
  } finally {
    await new Promise(resolve => setImmediate(resolve))
    process.off('unhandledRejection', onUnhandledRejection)
  }
}

test('all request APIs reject and remove their pending listener when the COLS iframe is missing', async () => {
  await captureUnhandledRejections(async unhandledRejections => {
    const { api, listenerCount } = setup()
    const outcomes = await Promise.all(
      requestCases.map(async ([name, request]) => ({
        name,
        outcome: await settleWithin(request(api)),
      })),
    )

    for (const { name, outcome } of outcomes) {
      assert.equal(outcome.status, 'rejected', `${name} should reject when the iframe is missing`)
      assert.match(outcome.error.message, /COLS iframe not found/)
    }
    assert.equal(listenerCount(), 0)
    assert.deepEqual(unhandledRejections, [])
  })
})

test('request API rejects and removes its pending listener when postMessage throws', async () => {
  await captureUnhandledRejections(async unhandledRejections => {
    const { api, listenerCount } = setup({
      select: async iframe => iframe,
      postMessage() {
        throw new Error('postMessage failed')
      },
    })

    const outcome = await settleWithin(api.getItem('key'))
    assert.equal(outcome.status, 'rejected')
    assert.match(outcome.error.message, /postMessage failed/)
    assert.equal(listenerCount(), 0)
    assert.deepEqual(unhandledRejections, [])
  })
})

test('COLS_RES resolves the matching request with its value', async () => {
  const { api, listenerCount, listeners, sentMessages } = setup({
    select: async iframe => iframe,
  })
  const request = api.getItem('key')
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(listenerCount(), 1)
  assert.deepEqual(JSON.parse(JSON.stringify(sentMessages[0])), {
    message: { id: 'id-1', type: 'COLS_GET', key: 'key' },
    origin: 'https://s1.hdslb.com',
  })
  listeners.get('message')({ data: { id: 'id-1', type: 'COLS_RES', value: 'stored value' } })

  assert.equal(await request, 'stored value')
  assert.equal(listenerCount(), 0)
})
