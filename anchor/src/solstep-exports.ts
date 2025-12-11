// Here we export some useful types and functions for interacting with the Anchor program.
// Import IDL - path from anchor/src/ to src/idl/
import SolstepIDL from '../../src/idl/solstep.json'

// Re-export the generated IDL
export { SolstepIDL }

// Program address from IDL
export const SOLSTEP_PROGRAM_ADDRESS = SolstepIDL.address as string

