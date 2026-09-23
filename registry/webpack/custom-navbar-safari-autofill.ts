import { buildByEntry } from './config'

export default buildByEntry({
  src: './registry/lib/plugins/',
  type: 'plugin',
  entry: './registry/lib/plugins/style/custom-navbar-safari-autofill/index.ts',
})
