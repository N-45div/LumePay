# Lumesquare Rust SDK

The Lumesquare Rust SDK provides developers with a comprehensive toolkit to build secure P2P marketplaces on Solana. This SDK encapsulates all the core functionality required for building trust-optimized commerce applications.

## Features

### 1. On-Chain Reputation System Verifiability

```rust
// Example: Verify a user's reputation
let reputation = lumesquare.reputation().verify("wallet_address_here");
println!("Reputation score: {}", reputation.score);
println!("Transaction count: {}", reputation.transaction_count);
println!("Success rate: {}%", reputation.success_rate * 100.0);
```

The reputation system provides:
- Verifiable on-chain reputation scores
- Transaction history verification
- Dispute resolution tracking
- Reputation-based access controls

### 2. Stablecoin Support via Circle SDK

```rust
// Example: Check stablecoin balance
let balance = lumesquare.stablecoin().get_balance("wallet_address_here", "USDC");
println!("USDC Balance: {}", balance);

// Example: Transfer stablecoins to escrow
let transfer_result = lumesquare.stablecoin().transfer(
    "sender_wallet",
    escrow_account,
    amount,
    "USDC"
);
```

Stablecoin features include:
- USDC support through Circle SDK integration
- Secure transfer mechanisms
- Balance verification
- Transaction history

### 3. Transparent Stablecoin Balance (Helius API)

```rust
// Example: Real-time balance monitoring
let balance_monitor = lumesquare.balance_monitor().new("wallet_address_here");
balance_monitor.on_change(|new_balance| {
    println!("Balance updated: {}", new_balance);
});
```

Balance monitoring features:
- Real-time balance updates
- Historical balance tracking
- Transaction notifications
- Support for multiple stablecoins

### 4. QR Code Transfers via Solana Pay

```rust
// Example: Generate a Solana Pay QR code
let qr_code = lumesquare.solana_pay().create_qr(
    recipient_address,
    amount,
    "Payment for Product #123",
    reference_id
);

// Convert to image or URI
let qr_uri = qr_code.to_uri();
let qr_image = qr_code.to_image("png");
```

Solana Pay integration includes:
- QR code generation
- Payment verification
- Callback support
- Mobile-friendly payment flows

### 5. Escrow for Dispute Management

```rust
// Example: Create an escrow
let escrow = lumesquare.escrow().create(
    buyer_wallet,
    seller_wallet,
    product_id,
    amount,
    expiry_time
);

// Example: Resolve a dispute
let resolution = lumesquare.dispute().resolve(
    escrow_id,
    resolution_type,
    resolution_details
);
```

Escrow features:
- Programmable escrow conditions
- Multi-signature release
- Time-locked escrows
- Dispute resolution framework

### 6. Sidetrack Integration

```rust
// Example: Use Sidetrack for high-performance operations
let sidetrack = lumesquare.sidetrack();
sidetrack.execute(async || {
    // High-performance operations
});
```

## Getting Started

### Installation

Add Lumesquare to your Cargo.toml:

```toml
[dependencies]
lumesquare-sdk = "0.1.0"
```

### Initialization

```rust
use lumesquare_sdk::Lumesquare;

fn main() {
    // Initialize the SDK with your API key
    let lumesquare = Lumesquare::new("your_api_key_here");
    
    // Configure the network (mainnet, testnet, devnet)
    lumesquare.configure_network(Network::Mainnet);
    
    // Ready to use!
}
```

## API Reference

Full API reference documentation is available at [docs.lumesquare.io/sdk](https://docs.lumesquare.io/sdk) (coming soon).

## Examples

Please see the `examples/` directory for complete sample applications.

## Contributing

We welcome contributions to the Lumesquare SDK! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.
