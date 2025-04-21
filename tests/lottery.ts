// tests/lottery.ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Lottery, LotteryState } from "../target/types/lottery"; // Import type from IDL
import { PaymentManagement } from "../target/types/payment_management";
import {
    TOKEN_PROGRAM_ID,
    createMint,
    createAccount,
    mintTo,
    getAccount,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("Lottery Comprehensive Test", () => {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    // Programs loaded from the workspace
    const lotteryProgram = anchor.workspace.Lottery as Program<Lottery>;
    const paymentProgram = anchor.workspace.PaymentManagement as Program<PaymentManagement>; // Correctly typed

    // Keypairs
    const authority = provider.wallet as anchor.Wallet; // Use the provider's wallet as authority
    const buyer = Keypair.generate();                   // Generate a keypair for the ticket buyer

    // Lottery state account
    const lotteryAccount = Keypair.generate();

    // SPL Token Mint and Accounts
    let mint: PublicKey;
    let buyerTokenAccount: PublicKey;
    let lotteryVaultTokenAccount: PublicKey; // The ATA for the lotteryAccount keypair

    // Constants for the test
    const TICKET_PRICE = new anchor.BN(100 * 1_000_000); // Example: 100 tokens (assuming 6 decimals)
    const MAX_PARTICIPANTS = 1; // Set to 1 for easy testing of state transition to Ready
    const MINT_DECIMALS = 6;

    before(async () => {
        // 1. Airdrop SOL to the buyer for transaction fees
        await provider.connection.requestAirdrop(buyer.publicKey, 2 * LAMPORTS_PER_SOL);
        // Delay to ensure airdrop confirmation
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`Buyer Pubkey: ${buyer.publicKey.toBase58()}`);

        // 2. Create SPL Token Mint
        mint = await createMint(
            provider.connection,
            authority.payer, // Payer for mint creation
            authority.publicKey, // Mint authority
            null, // Freeze authority (optional)
            MINT_DECIMALS // Decimals
        );
        console.log(`Token Mint Created: ${mint.toBase58()}`);

        // 3. Create Token Accounts
        // Buyer's token account
        buyerTokenAccount = await createAccount(
            provider.connection,
            buyer, // Payer for account creation is the buyer
            mint,
            buyer.publicKey // Owner of the token account is the buyer
        );
        console.log(`Buyer Token Account: ${buyerTokenAccount.toBase58()}`);

        // Lottery's vault token account (owned by the lottery account keypair for simplicity in test)
        // In practice, this might be a PDA owned by the lottery program.
        lotteryVaultTokenAccount = await createAccount(
            provider.connection,
            authority.payer,        // Payer for account creation
            mint,                   // Mint address
            lotteryAccount.publicKey // Owner is the Lottery account itself
        );
        console.log(`Lottery Vault Token Account: ${lotteryVaultTokenAccount.toBase58()}`);


        // 4. Mint tokens to the buyer's account
        const mintAmount = TICKET_PRICE.muln(2); // Mint enough for a ticket
        await mintTo(
            provider.connection,
            authority.payer, // Payer for minting
            mint,
            buyerTokenAccount,
            authority.publicKey, // Mint authority specified during creation
            mintAmount.toNumber() // Amount to mint (needs conversion if BN > JS number limits)
        );
        console.log(`Minted ${mintAmount.toString()} tokens to buyer account.`);

        const buyerBalance = await provider.connection.getTokenAccountBalance(buyerTokenAccount);
        assert.equal(buyerBalance.value.amount, mintAmount.toString(), "Buyer balance after minting is incorrect");
    });

    it("Initializes the lottery", async () => {
        await lotteryProgram.methods
            .initialize(TICKET_PRICE, MAX_PARTICIPANTS)
            .accounts({
                lottery: lotteryAccount.publicKey,
                authority: authority.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([lotteryAccount, authority.payer]) // lotteryAccount signs because it's being created (init)
            .rpc();

        // Fetch the created account
        const lotteryData = await lotteryProgram.account.lottery.fetch(lotteryAccount.publicKey);

        // Assertions
        assert.ok(lotteryData.authority.equals(authority.publicKey), "Authority mismatch");
        assert.equal(lotteryData.ticketPrice.toString(), TICKET_PRICE.toString(), "Ticket price mismatch");
        assert.equal(lotteryData.maxParticipants, MAX_PARTICIPANTS, "Max participants mismatch");
        assert.equal(lotteryData.participantsCount, 0, "Initial participants count should be 0");
        assert.isNull(lotteryData.winner, "Initial winner should be null");
        // Deep equality check for enum object
        assert.deepEqual(lotteryData.lotteryState, { created: {} } as LotteryState, "Initial state should be Created"); // Adjust enum check based on IDL type
        console.log("Lottery initialized successfully.");
    });

    it("Buys a ticket using CPI", async () => {
        // Ensure lottery is initialized before buying
        let lotteryData = await lotteryProgram.account.lottery.fetch(lotteryAccount.publicKey);
        assert.deepEqual(lotteryData.lotteryState, { created: {} } as LotteryState, "Lottery not in Created state before buying ticket");

        const buyerBalanceBefore = await getAccount(provider.connection, buyerTokenAccount);
        const vaultBalanceBefore = await getAccount(provider.connection, lotteryVaultTokenAccount);

        console.log(`Buyer balance before: ${buyerBalanceBefore.amount}`);
        console.log(`Vault balance before: ${vaultBalanceBefore.amount}`);

        try {
            await lotteryProgram.methods
                .buyTicket()
                .accounts({
                    lottery: lotteryAccount.publicKey,
                    buyer: buyer.publicKey,
                    buyerTokenAccount: buyerTokenAccount,
                    lotteryVault: lotteryVaultTokenAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    paymentProgram: paymentProgram.programId, // Pass the PaymentManagement program ID
                })
                .signers([buyer]) // Buyer signs to authorize token transfer from their account
                .rpc({ skipPreflight: false }); // skipPreflight true can help debug on-chain errors

             console.log("buyTicket transaction sent.");

        } catch (error) {
            console.error("Error buying ticket:", error);
             // Log program logs for CPI debugging
             if (error.logs) {
                console.error("Program Logs:");
                error.logs.forEach(log => console.error(log));
            }
            throw error; // Fail the test
        }


        // Fetch updated balances and state
        const buyerBalanceAfter = await getAccount(provider.connection, buyerTokenAccount);
        const vaultBalanceAfter = await getAccount(provider.connection, lotteryVaultTokenAccount);
        lotteryData = await lotteryProgram.account.lottery.fetch(lotteryAccount.publicKey);

        console.log(`Buyer balance after: ${buyerBalanceAfter.amount}`);
        console.log(`Vault balance after: ${vaultBalanceAfter.amount}`);

        // Assertions
        const expectedBuyerBalance = BigInt(buyerBalanceBefore.amount) - BigInt(TICKET_PRICE.toString());
        const expectedVaultBalance = BigInt(vaultBalanceBefore.amount) + BigInt(TICKET_PRICE.toString());

        assert.equal(buyerBalanceAfter.amount.toString(), expectedBuyerBalance.toString(), "Buyer balance incorrect after purchase");
        assert.equal(vaultBalanceAfter.amount.toString(), expectedVaultBalance.toString(), "Lottery vault balance incorrect after purchase");
        assert.equal(lotteryData.participantsCount, 1, "Participants count should increment");

        // Check state transition (since MAX_PARTICIPANTS = 1)
        assert.deepEqual(lotteryData.lotteryState, { ready: {} } as LotteryState, "Lottery state should be Ready");
        console.log("Ticket purchased successfully via CPI.");
    });

     it("Cannot buy ticket when lottery is full/ready", async () => {
        // Lottery state should be Ready after the previous test
        try {
            await lotteryProgram.methods
                .buyTicket()
                .accounts({
                    lottery: lotteryAccount.publicKey,
                    buyer: buyer.publicKey,
                    buyerTokenAccount: buyerTokenAccount,
                    lotteryVault: lotteryVaultTokenAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    paymentProgram: paymentProgram.programId,
                })
                .signers([buyer])
                .rpc();
            assert.fail("Should have failed because lottery is not in Created state");
        } catch (error) {
            // Check for the specific error code if possible, or just that it failed
            // Error code check depends on Anchor version and how errors are surfaced
            // console.log("Error details:", error);
            // Example check (adjust based on actual error structure):
             assert.include(error.toString(), "InvalidLotteryState", "Expected InvalidLotteryState error");
            console.log("Successfully prevented buying ticket in Ready state.");
        }
    });


    it("Draws a winner", async () => {
        // Ensure lottery is in Ready state
        let lotteryData = await lotteryProgram.account.lottery.fetch(lotteryAccount.publicKey);
        assert.deepEqual(lotteryData.lotteryState, { ready: {} } as LotteryState, "Lottery not in Ready state before drawing");

        await lotteryProgram.methods
            .drawWinner()
            .accounts({
                lottery: lotteryAccount.publicKey,
                authority: authority.publicKey,
                // Note: Clock sysvar is implicitly passed by Anchor when Clock::get() is used
            })
            .signers([authority.payer]) // Authority signs to trigger the draw
            .rpc();

        // Fetch updated state
        lotteryData = await lotteryProgram.account.lottery.fetch(lotteryAccount.publicKey);

        // Assertions
        assert.isNotNull(lotteryData.winner, "Winner should be set");
        // Since MAX_PARTICIPANTS=1 and participants_count=1, winner index must be 0
        assert.equal(lotteryData.winner, 0, "Winner index should be 0");
        assert.deepEqual(lotteryData.lotteryState, { completed: {} } as LotteryState, "Lottery state should be Completed");
        console.log(`Winner drawn successfully: Index ${lotteryData.winner}`);
    });
});