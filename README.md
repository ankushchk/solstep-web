# SolStep Web

**SolStep** is a location-based AR fitness application built on Solana blockchain that gamifies physical movement through geolocation-based challenges and NFT collection. Users explore real-world locations, capture photos at checkpoints, and compete in staking challenges.


## Architecture Diagram

![SolStep Challenge Flow](https://github.com/user-attachments/assets/c778ea27-7b3c-4f2e-9c0e-8f8e3612a897)

_Diagram showing the challenge creation, invitation, staking and escrow settlement flow_

## Core Concept

- **Location-Based Gameplay**: Users walk to real locations (checkpoints) discovered via Google Maps API
- **Photo Capture with Verification**: Users take photos at checkpoints with geolocation verification (must be within 50m)
- **NFT Minting**: Verified photos are minted as compressed NFTs (cNFTs) on Solana using Metaplex Bubblegum
- **Competitive Challenges**: Users can create/join 10-spot challenges where the first person to capture all 10 locations wins the prize pool
- **Staking System**: Challenges use Solana program for escrow and automatic payouts

## Tech Stack

### Frontend

- **Framework**: Next.js 16.0.7 (App Router)
- **UI**: React 19.2.0, Tailwind CSS 4
- **Maps**: Google Maps API (`@react-google-maps/api`)
- **Camera**: `react-webcam` for photo capture
- **TypeScript**: Full type safety

### Blockchain

- **Solana**: Devnet network
- **Anchor**: 0.30.1 for Solana program interaction
- **Metaplex**: Compressed NFT minting (`@metaplex-foundation/mpl-bubblegum`)
- **IPFS**: NFT.Storage for image and metadata storage
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

/history
  - Completed challenges
  - Win/loss history
  - Payout records

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
- `useNFTMinting`: Compressed NFT minting with progress tracking

### Services

- `nftMinting.ts`: Metaplex compressed NFT minting service
- `ipfsUpload.ts`: NFT.Storage integration for IPFS uploads
- `places.ts`: Google Places API wrapper with mock fallback

### Solana Program (Anchor)

**Program ID**: `3aezMEt3EwNGU7uxBSNNwmXN5b54WXzmyosXpXSdma52`

**Instructions**:

1. `createChallenge`: Create a new challenge with stake amount, duration, max participants
2. `initEscrow`: Initialize escrow account for challenge funds
3. `joinChallenge`: Join challenge and stake SOL
4. `finalizeChallenge`: Finalize challenge (organizer only)
5. `settleChallenge`: Distribute winnings to winner and handle penalties

**Account Structure**:

- `Challenge`: Stores challenge metadata, participants, stakes, timestamps
- `OrganizerStats`: Tracks organizer statistics
- `Escrow`: PDA account holding challenge stakes

## Features Implemented

### ✅ Core Features

1. **User Authentication**: Google OAuth via Firebase
2. **Location Discovery**: Google Places API integration with 8 place type filters
3. **Real-time Geolocation**: Continuous GPS tracking with high accuracy
4. **Photo Capture**: Webcam-based photo capture
5. **Geolocation Verification**: 50-meter radius verification before saving
6. **Compressed NFT Minting**: Automatic cNFT creation on Solana after verification (~0.00001 SOL cost)
7. **Challenge System**:
   - Create 10-spot challenges with custom stake/duration
   - Join challenges with SOL staking
   - Real-time progress tracking (spots captured per participant)
   - Leaderboard display
   - Automatic winner detection (first to capture all 10 spots)
   - Escrow-based prize pool management
   - Challenge history and completion tracking

### ✅ Data Storage

- **Firestore Collections**:
  - `users`: User profiles
  - `avatars`: Collected photos with metadata and NFT mint addresses
  - `challenges`: Challenge metadata (10 spots, organizer, etc.)
  - `challengeProgress`: Participant progress tracking
  - `challengeInvites`: Wallet address-based invites
- **Solana On-Chain**:
  - Challenge accounts (stakes, participants, timestamps)
  - Escrow accounts (prize pools)
  - Compressed NFT ownership and metadata

### ✅ UI/UX Features

- Mobile-first responsive design
- Dark theme (slate-950/900)
- Real-time status indicators
- Progress bars for challenge completion
- Error handling with user-friendly messages
- Loading states and animations
- Share challenge functionality (link, QR code, social media)
- Challenge details modal with participant list
- Active challenge highlighting
- Prevention of joining multiple active challenges

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Google Cloud account (for Maps API and Places API)
- Firebase project
- Solana wallet (Phantom recommended)
- NFT.Storage account (optional, for IPFS uploads)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ankushchk/solstep-web.git
cd solstep-web
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file:
```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
NEXT_PUBLIC_NFT_STORAGE_API_KEY=your_nft_storage_api_key
```

4. Configure Firebase:
Update `src/lib/firebase.ts` with your Firebase config.

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: Google Maps/Places API key
- `NEXT_PUBLIC_NFT_STORAGE_API_KEY`: NFT.Storage API key (optional, uses placeholder if not set)
- Firebase config (in `src/lib/firebase.ts`)

## Data Flow

### Avatar Collection Flow

1. User navigates to checkpoint on map
2. Gets within 100m radius → "Collect" button enabled
3. Opens camera page
4. Captures photo
5. System verifies location (must be within 50m)
6. If verified → Uploads image to IPFS (NFT.Storage)
7. Mints compressed NFT on Solana (Metaplex Bubblegum)
8. Saves avatar to Firestore with NFT mint address
9. Updates challenge progress if user is in active challenge
10. Checks for winner (if all 10 spots captured)

### Challenge Flow

1. User selects 10 checkpoints on map (auto-selected with spacing)
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
│   ├── history/           # Challenge history page
│   ├── map/              # Main game page (map + challenges tabs)
│   │   ├── components/   # Map-specific components
│   │   ├── constants.ts  # Map constants
│   │   ├── types.ts      # Map types
│   │   └── utils.ts      # Map utilities
│   ├── profile/          # User profile page
│   └── page.tsx          # Home/landing page
├── components/            # React components
│   ├── ChallengeDetailsModal.tsx
│   ├── ErrorBoundary.tsx
│   ├── NFTCard.tsx
│   ├── ReactQueryProvider.tsx
│   ├── SolanaProviders.tsx
│   └── toast-tx.tsx
├── hooks/                # Custom React hooks
│   ├── useAnchorProgram.ts
│   ├── useAuth.ts
│   ├── useAvatarCollection.ts
│   ├── useChallenges.ts
│   ├── useCheckpoints.ts
│   ├── useGeolocation.ts
│   ├── useNFTMinting.ts
│   ├── useSolana.ts
│   └── useUserProfile.ts
├── idl/                  # Solana program IDL
│   └── solstep.json
├── lib/                  # Library configurations
│   ├── firebase.ts
│   ├── metaplex.ts
│   ├── solana.ts
│   └── utils.ts
├── services/             # Business logic services
│   ├── ipfsUpload.ts
│   ├── nftMinting.ts
│   └── places.ts
└── utils/                # Utility functions
    ├── instructions.ts
    ├── location.ts
    ├── nftMetadata.ts
    ├── pdas.ts
    ├── stats.ts
    └── types.ts
```

## Dependencies Summary

- **Blockchain**: `@coral-xyz/anchor`, `@solana/web3.js`, `@metaplex-foundation/mpl-bubblegum`
- **Maps**: `@react-google-maps/api`
- **Auth/DB**: `firebase`
- **UI**: `tailwindcss`, `react`, `react-dom`
- **Framework**: `next`
- **NFT Storage**: `nft.storage`
- **State Management**: `@tanstack/react-query`

## Current State & Known Issues

### ✅ Working

- User authentication
- Location discovery and mapping
- Photo capture
- Geolocation verification
- Compressed NFT minting (Metaplex Bubblegum + IPFS)
- Challenge creation and joining
- Progress tracking
- Firestore data persistence
- Challenge history
- Escrow management

### ⚠️ Known Limitations

1. **Network**: Currently configured for Solana Devnet
   - Mainnet support can be added by updating RPC endpoint
2. **NFT Storage**: Uses NFT.Storage for IPFS uploads
   - Falls back to placeholder URLs if API key not configured
3. **Daily Challenge Limit**: Users can create max 2 challenges per day
   - Enforced via Firestore queries
