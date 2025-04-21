# 🎟️ Lottery CPI System on Solana

This project demonstrates how to implement **secure Cross-Program Invocation (CPI)** between two Solana programs using the Anchor framework.

## 📦 Programs

- `🎯 PaymentManagement`: Handles SPL token transfers and payment processing.
- `🎰 Lottery`: Implements lottery logic and securely calls `PaymentManagement` using CPI.


## ⚙️ Environment

- **Solana CLI**: `2.1.21`
- **Rust**: `1.88.0-nightly (b8c54d635 2025-04-20)`
- **Anchor CLI**: `0.31.1`
  

## 📁 Project Setup

## Initialize the main lottery project
```bash
anchor init lottery
```

## Add the CPI program as a sub-program
```bash
anchor add payment_management
```

## 📦 Dependencies

In Cargo.toml (lottery and payment_management), include:

[dependencies]
anchor-spl = { version = "0.31.1", features = ["default"] }

## 🔨 Build & Deploy

Make sure you're in the project root (lottery) before running these:

# Build both programs

```bash
anchor build
```

# Deploy both programs to localnet

```bash
anchor deploy
```

🧪 Local Testing

Run tests with:

```bash
anchor test
```
This executes your end-to-end flow (minting, initializing accounts, CPI transfers, etc.) on localnet.

## 🧩 Features Covered

    ✅ Cross-program invocation (CPI)

    ✅ Token transfers via Anchor CPI

    ✅ SPL Token minting and account setup

    ✅ Secure SOL/token management

## 📁 Directory Structure

lottery/
├── programs/
│   ├── lottery/              # Main lottery logic
│   └── payment_management/   # Payment handler called via CPI
├── tests/                    # Anchor-based Mocha tests
└── Anchor.toml

## 🛠️ Notes

    CPI requires explicit account passing from the caller to the callee.

    Anchor auto-validates accounts, so missing accounts will throw clear runtime errors.

    For debugging, use the solana logs or anchor test --skip-local-validator --provider.cluster localnet flags.

## 🔗 Useful Commands

solana address -k target/deploy/lottery-keypair.json        # Get lottery program ID
solana address -k target/deploy/payment_management-keypair.json  # Get payment program ID
solana logs                                                  # View live localnet logs

## 🧪 Install mocha

    If ts-mocha is not found, install it:
```bash
 npm install --save-dev ts-mocha
```
