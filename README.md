# Lumesquare 

A decentralized peer-to-peer marketplace built on Solana that leverages stablecoins and smart contracts for secure trading.

## Project Overview

Lumesquare provides a trust-optimized protocol for peer-to-peer commerce, focusing on:

1. **Rust SDK for Marketplace Infrastructure** - A comprehensive SDK that developers can use to build safe P2P marketplaces
2. **Trust-Optimized Escrow Protocol** - Programmable release conditions for secure transactions
3. **On-Chain Reputation System** - Verifiable reputation tracking for marketplace participants
4. **Stablecoin Integration** - Built-in support for stablecoins via Circle SDK
5. **Seamless UX Layer** - Modern interface with Solana Pay QR code support

## Architecture

The project is structured as a multi-layered application:

### Rust SDK Layer
- Core P2P marketplace functionality exposed as a Rust SDK
- On-chain reputation system verifiability
- Stablecoin support via Circle SDK
- QR code transfers via Solana Pay

### Smart Contract Layer
- `EscrowCore.sol` - Handles the escrow logic
- `ReputationManager.sol` - Manages on-chain reputation
- `ListingFactory.sol` - Creates and manages listings
- `DisputeResolver.sol` - Handles dispute resolution

### Backend Infrastructure
- Node.js/Express RESTful API
- PostgreSQL for data persistence
- Redis for caching
- WebSocket for real-time notifications
- Blockchain integration for Solana transactions

## API Documentation

API documentation is available at `/api/docs` when running the development server.

## SDK Documentation

SDK documentation is available in the [sdk-docs](./docs/sdk/) directory.

## Development

### Prerequisites
- Node.js v16+
- Rust 1.58+
- PostgreSQL 13+
- Redis 6+
- Solana development environment

### Setup
1. Clone the repository
2. Install dependencies with `npm install`
3. Configure environment variables
4. Start the development server with `npm run dev`

## Roadmap

The development is divided into 5 phases:

1. **Foundation (Days 1-3):** Backend and smart contract setup
2. **Core Features (Days 4-7):** Backend services and blockchain integration
3. **Advanced Features (Days 8-10):** SDK development and integration
4. **Integration & Testing (Days 11-12):** Comprehensive testing and documentation
5. **Polish & Presentation (Days 13-14):** Final optimizations and demo preparation

## License

[MIT](LICENSE)
