import path from 'path'
import lodash from 'lodash'
import webpack from 'webpack'
import { getBanner, getDefaultConfig } from './webpack.config'
import previewMeta from '../src/client/bilibili-evolved.preview.meta.json'

const baseUrl = 'https://github.com/zed76r/Bilibili-Evolved-Userscripts/releases/latest/download'
// Keep the upstream runtime version for component compatibility checks.
const version = new Date().toISOString().replace(/[-:]/g, '').replace('T', '.').slice(0, 15)
const banner = getBanner({
  ...previewMeta,
  updateURL: `${baseUrl}/bilibili-evolved.meta.js`,
  downloadURL: `${baseUrl}/bilibili-evolved.user.js`,
}).replace(/^(\/\/ @version\s+).*$/m, `$1${version}`)

const config = getDefaultConfig()
config.mode = 'production'
config.entry = './src/client/bilibili-evolved.ts'
config.output = {
  path: path.resolve(__dirname, '../dev-tools/userscripts/dist'),
  filename: 'bilibili-evolved.user.js',
  clean: true,
}
config.cache = { type: 'memory' }
lodash.set(config, 'resolve.alias.vue$', 'vue/dist/vue.runtime.common.prod.js')
config.plugins.push(new webpack.BannerPlugin({ banner, raw: true, entryOnly: true }), {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('UserscriptsMetadata', compilation => {
      compilation.hooks.processAssets.tap(
        {
          name: 'UserscriptsMetadata',
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          const metadata = banner.slice(0, banner.indexOf('// ==/UserScript=='))
          compilation.emitAsset(
            'bilibili-evolved.meta.js',
            new webpack.sources.RawSource(`${metadata}// ==/UserScript==\n`),
          )
        },
      )
    })
  },
})

export default config
