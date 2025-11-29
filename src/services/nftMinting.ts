"use client";

// Temporarily disabled NFT minting to fix build errors
// Will be re-enabled once wallet adapter integration is fixed

export interface MintNFTParams {
  imageDataUrl: string;
  name: string;
  description: string;
  attributes?: Array<{ trait_type: string; value: string }>;
  checkpointId: string;
  checkpointName: string;
  location: { lat: number; lng: number };
  verifiedLocation: { lat: number; lng: number };
}

export async function mintNFT(
  params: MintNFTParams,
  wallet: any,
  connection: any
): Promise<string> {
  // Temporarily disabled - returns a placeholder
  // TODO: Re-implement with proper wallet adapter integration
  console.warn("NFT minting is temporarily disabled");
  return "NFT_MINTING_DISABLED";
  
  /* Original implementation - commented out until wallet adapter integration is fixed
  import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
  import {
    createGenericFileFromBrowserFile,
    generateSigner,
  } from "@metaplex-foundation/umi";
  import {
    createNft,
    mplTokenMetadata,
    UploadMetadataInput,
  } from "@metaplex-foundation/mpl-token-metadata";
  
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  // Create UMI instance
  const umi = createUmi(connection.rpcEndpoint);
  umi.use(mplTokenMetadata());

  // Convert image data URL to blob
  const response = await fetch(params.imageDataUrl);
  const blob = await response.blob();
  const file = new File([blob], `${params.checkpointId}.jpg`, {
    type: "image/jpeg",
  });

  // Upload image
  const imageFile = await createGenericFileFromBrowserFile(file);
  const [imageUri] = await umi.uploader.upload([imageFile]);

  // Create metadata
  const metadata: UploadMetadataInput = {
    name: params.name,
    description: params.description,
    image: imageUri,
    attributes: [
      { trait_type: "Checkpoint", value: params.checkpointName },
      { trait_type: "Checkpoint ID", value: params.checkpointId },
      {
        trait_type: "Location",
        value: `${params.location.lat}, ${params.location.lng}`,
      },
      {
        trait_type: "Verified Location",
        value: `${params.verifiedLocation.lat}, ${params.verifiedLocation.lng}`,
      },
      ...(params.attributes || []),
    ],
  };

  // Upload metadata
  const [metadataUri] = await umi.uploader.upload([metadata]);

  // Generate mint signer
  const mint = generateSigner(umi);

  // Mint NFT
  await createNft(umi, {
    mint,
    name: params.name,
    uri: metadataUri,
    sellerFeeBasisPoints: 0, // No royalties
  }).sendAndConfirm(umi);

  return mint.publicKey;
  */

  // Convert image data URL to blob
  const response = await fetch(params.imageDataUrl);
  const blob = await response.blob();
  const file = new File([blob], `${params.checkpointId}.jpg`, {
    type: "image/jpeg",
  });

  // Upload image
  const imageFile = await createGenericFileFromBrowserFile(file);
  const [imageUri] = await umi.uploader.upload([imageFile]);

  // Create metadata
  const metadata: UploadMetadataInput = {
    name: params.name,
    description: params.description,
    image: imageUri,
    attributes: [
      { trait_type: "Checkpoint", value: params.checkpointName },
      { trait_type: "Checkpoint ID", value: params.checkpointId },
      { trait_type: "Location", value: `${params.location.lat}, ${params.location.lng}` },
      { trait_type: "Verified Location", value: `${params.verifiedLocation.lat}, ${params.verifiedLocation.lng}` },
      ...(params.attributes || []),
    ],
  };

  // Upload metadata
  const [metadataUri] = await umi.uploader.upload([metadata]);

  // Generate mint signer
  const mint = generateSigner(umi);

  // Mint NFT
  await createNft(umi, {
    mint,
    name: params.name,
    uri: metadataUri,
    sellerFeeBasisPoints: 0, // No royalties
  }).sendAndConfirm(umi);

  return mint.publicKey;
}

