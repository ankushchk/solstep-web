# SolStep Web - Solstep

**SolStep** is a location-based AR fitness application built on Solana blockchain that gamifies physical movement through geolocation-based challenges and NFT collection. Users explore real-world locations, capture photos at checkpoints, and compete in staking challenges.

## Core Concept

- **Location-Based Gameplay**: Users walk to real locations (checkpoints) discovered via Google Maps API
- **Photo Capture with Verification**: Users take photos at checkpoints with geolocation verification (must be within 50m)
- **NFT Minting**: Verified photos are minted as NFTs on Solana using Metaplex
- **Competitive Challenges**: Users can create/join 10-spot challenges where the first person to capture all 10 locations wins the prize pool
- **Staking System**: Challenges use Solana program for escrow and automatic payouts

## Tech Stack

### Frontend

- **Framework**: Next.js 16.0.4 (App Router)
- **UI**: React 19.2.0, Tailwind CSS 4
- **Maps**: Google Maps API (`@react-google-maps/api`)
- **Camera**: `react-webcam` for photo capture
- **TypeScript**: Full type safety

### Blockchain

- **Solana**: Devnet network
- **Anchor**: 0.30.1 for Solana program interaction
- **Metaplex**: NFT minting (`@metaplex-foundation/mpl-token-metadata`)
- **Wallets**: Phantom, Solflare, Torus support via `@solana/wallet-adapter-react`

### Backend/Storage

- **Firebase**:
  - Authentication (Google OAuth)
  - Firestore for user data, avatars, challenge progress
- **Google APIs**:
  - Places API for location discovery
  - Google Fit API integration (for fitness tracking)

## Architecture

### Pages Structure

```
/ (Home)
  - Landing page with stats
  - Google OAuth login
  - Navigation to map/profile/challenges

/map (Main Game Page)
  - Tab 1: Interactive map with checkpoints
  - Tab 2: Challenges list with progress tracking
  - Real-time geolocation tracking
  - Checkpoint discovery and filtering
  - Challenge creation (10-spot selection)

/camera
  - Photo capture interface
  - Geolocation verification (50m radius)
  - NFT minting after verification
  - Challenge progress updates

/profile
  - User stats and collected avatars
  - Google Fit integration
  - NFT gallery

/challenges (Legacy page - functionality moved to /map)
  - Challenge management UI
```

### Key Hooks

- `useAnchorProgram`: Solana program initialization and wallet connection
- `useChallenges`: Challenge CRUD operations, escrow management
- `useAvatarCollection`: Avatar storage (Firestore + localStorage fallback)
- `useGeolocation`: Real-time GPS tracking
- `useCheckpoints`: Google Places API integration for location discovery
- `useAuth`: Firebase authentication
- `useUserProfile`: User profile data with Google Fit stats

### Services

- `nftMinting.ts`: Metaplex NFT minting service
- `places.ts`: Google Places API wrapper with mock fallback

### Solana Program (Anchor)

**Program ID**: `C8hypxjf45Kne9PaLBWtg9tRqdingEaWFyvVUL4A6AVQ`

**Instructions**:

1. `createChallenge`: Create a new challenge with stake amount, duration, max participants
2. `initEscrow`: Initialize escrow account for challenge funds
3. `joinChallenge`: Join challenge and stake SOL
4. `finalizeChallenge`: Finalize challenge (organizer only)
5. `payoutWinner`: Distribute winnings to winner

**Account Structure**:

- `Challenge`: Stores challenge metadata, participants, stakes, timestamps

## Features Implemented

### ✅ Core Features

1. **User Authentication**: Google OAuth via Firebase
2. **Location Discovery**: Google Places API integration with 8 place type filters
3. **Real-time Geolocation**: Continuous GPS tracking with high accuracy
4. **Photo Capture**: Webcam-based photo capture
5. **Geolocation Verification**: 50-meter radius verification before saving
6. **NFT Minting**: Automatic NFT creation on Solana after verification
7. **Challenge System**:
   - Create 10-spot challenges with custom stake/duration
   - Join challenges with SOL staking
   - Real-time progress tracking (spots captured per participant)
   - Leaderboard display
   - Automatic winner detection (first to capture all 10 spots)
   - Escrow-based prize pool management

### ✅ Data Storage

- **Firestore Collections**:
  - `users`: User profiles
  - `avatars`: Collected photos with metadata
  - `challenges`: Challenge metadata (10 spots, organizer, etc.)
  - `challengeProgress`: Participant progress tracking
- **Solana On-Chain**:
  - Challenge accounts (stakes, participants, timestamps)
  - Escrow accounts (prize pools)
  - NFT metadata and ownership

### ✅ UI/UX Features

- Mobile-first responsive design
- Dark theme (slate-950/900)
- Real-time status indicators
- Progress bars for challenge completion
- Error handling with user-friendly messages
- Loading states and animations

## Current State & Known Issues

### ✅ Working

- User authentication
- Location discovery and mapping
- Photo capture
- Geolocation verification
- NFT minting (Metaplex integration)
- Challenge creation and joining
- Progress tracking
- Firestore data persistence

### ⚠️ Issues/Improvements Needed

1. **Program Initialization**: Sometimes program doesn't initialize immediately after wallet connection
   - Added retry mechanism and better error handling
   - May need wallet adapter configuration improvements
2. **NFT Minting**: Currently using Metaplex UMI - may need IPFS/Arweave for image storage

   - Images uploaded to Metaplex's default uploader
   - Consider NFT.storage or Arweave for permanent storage

3. **Challenge Winner Detection**: Automatic detection works but payout requires challenge finalization

   - Could add automatic finalization when winner is detected

4. **Network Configuration**: Currently hardcoded to Devnet

   - Should add network switching or mainnet support

5. **Error Handling**: Some edge cases may need better handling
   - Wallet disconnection during operations
   - Network failures
   - Transaction failures

## Data Flow

### Avatar Collection Flow

1. User navigates to checkpoint on map
2. Gets within 100m radius → "Collect" button enabled
3. Opens camera page
4. Captures photo
5. System verifies location (must be within 50m)
6. If verified → Mints NFT on Solana
7. Saves avatar to Firestore with NFT mint address
8. Updates challenge progress if user is in active challenge
9. Checks for winner (if all 10 spots captured)

### Challenge Flow

1. User selects 10 checkpoints on map
2. Creates challenge with stake amount, duration, max participants
3. Solana program creates challenge account
4. Escrow account initialized
5. Other users join by staking SOL
6. Participants capture spots → progress tracked in Firestore
7. First to capture all 10 → marked as winner
8. Organizer finalizes challenge
9. Winner receives payout from escrow

## File Structure

```
src/
├── app/                    # Next.js pages
│   ├── api/               # API routes (Google Fit, Places)
│   ├── camera/            # Photo capture page
│   ├── challenges/        # Legacy challenges page
│   ├── map/              # Main game page (map + challenges tabs)
│   ├── profile/          # User profile page
│   └── page.tsx          # Home/landing page
├── components/            # React components
│   └── SolanaProviders.tsx
├── hooks/                # Custom React hooks
│   ├── useAnchorProgram.ts
│   ├── useAuth.ts
│   ├── useAvatarCollection.ts
│   ├── useChallenges.ts
│   ├── useCheckpoints.ts
│   ├── useGeolocation.ts
│   └── useUserProfile.ts
├── idl/                  # Solana program IDL
│   └── solstep.json
├── lib/                  # Library configurations
│   ├── firebase.ts
│   └── solana.ts
├── services/             # Business logic services
│   ├── nftMinting.ts
│   └── places.ts
└── utils/                # Utility functions
    ├── location.ts
    ├── stats.ts
    └── types.ts
```

## Environment Variables Needed

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: Google Maps/Places API key
- Firebase config (in `lib/firebase.ts`)
- Solana RPC endpoint (currently using public devnet)

## Dependencies Summary

- **Blockchain**: Anchor, Solana Web3.js, Metaplex
- **Maps**: Google Maps React
- **Auth/DB**: Firebase
- **UI**: Tailwind CSS, React 19
- **Framework**: Next.js 16

## Next Steps / Roadmap Ideas

- [ ] Mainnet deployment
- [ ] Enhanced NFT metadata (more attributes, rarity system)
- [ ] Social features (sharing, leaderboards)
- [ ] Mobile app (React Native)
- [ ] Additional challenge types
- [ ] Team/group challenges
- [ ] Achievement system
- [ ] Marketplace for trading NFTs
