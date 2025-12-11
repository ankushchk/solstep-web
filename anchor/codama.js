// Codama configuration for generating TypeScript code from Anchor IDL
import { createCodamaConfig } from './src/create-codama-config.js'

export default createCodamaConfig({
  clientJs: 'anchor/src/client/js/generated',
  idl: 'target/idl/solstep.json',
})

