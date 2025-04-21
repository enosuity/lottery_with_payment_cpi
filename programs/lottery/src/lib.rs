
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use payment_management::program::PaymentManagement;
use payment_management::cpi::accounts::TransferTokens;
use payment_management::{self};

declare_id!("5AsVzadXQJt4czTM76rBnEVLV5AX7fzbim9E7pgtAhGi");

#[program]
pub mod lottery {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, ticket_price: u64, max_participants: u8) -> Result<()> {
        let lottery = &mut ctx.accounts.lottery;
        
        lottery.authority = ctx.accounts.authority.key();
        lottery.ticket_price = ticket_price;
        lottery.max_participants = max_participants;
        lottery.participants_count = 0;
        lottery.winner = None;
        lottery.lottery_state = LotteryState::Created;
        
        Ok(())
    }

    pub fn buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
        let lottery = &mut ctx.accounts.lottery;
        
        // Check if lottery is open
        require!(lottery.lottery_state == LotteryState::Created, LotteryError::InvalidLotteryState);
        
        // Check if there's space for more participants
        require!(
            lottery.participants_count < lottery.max_participants,
            LotteryError::LotteryFull
        );
        
        // Use CPI to transfer tokens from buyer to lottery vault
        let cpi_program = ctx.accounts.payment_program.to_account_info();
        let cpi_accounts = TransferTokens {
            from_account: ctx.accounts.buyer_token_account.to_account_info(),
            to_account: ctx.accounts.lottery_vault.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        };
        
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        payment_management::cpi::transfer(cpi_ctx, lottery.ticket_price)?;
        
        // Register participant
        lottery.participants_count += 1;
        
        // Check if lottery is full
        if lottery.participants_count == lottery.max_participants {
            lottery.lottery_state = LotteryState::Ready;
        }
        
        Ok(())
    }

    pub fn draw_winner(ctx: Context<DrawWinner>) -> Result<()> {
        let lottery = &mut ctx.accounts.lottery;
        
        // Check if lottery is ready for drawing
        require!(lottery.lottery_state == LotteryState::Ready, LotteryError::InvalidLotteryState);
        
        // In a real implementation, you'd want to use a secure randomness source
        // For demo purposes, we'll use a simple hash-based approach
        let clock = Clock::get()?;
        let random_seed = hash(&[
            &lottery.authority.to_bytes()[..],
            &clock.unix_timestamp.to_le_bytes()[..],
            &[lottery.participants_count],
        ]);
        
        // Select winner (simplified)
        let winner_index = (random_seed[0] as u8) % lottery.participants_count;
        
        // In a real implementation, you'd store the participants and select one
        // For the demo, we'll just store the index
        lottery.winner = Some(winner_index);
        lottery.lottery_state = LotteryState::Completed;
        
        msg!("Winner selected: Participant #{}", winner_index);
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8 + 1 + 1 + 1 + 1 + 1 // Discriminator + PubKey + ticket_price + max_participants + participants_count + winner (option) + state
    )]
    pub lottery: Account<'info, Lottery>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyTicket<'info> {
    #[account(mut)]
    pub lottery: Account<'info, Lottery>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub lottery_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub payment_program: Program<'info, PaymentManagement>,
}

#[derive(Accounts)]
pub struct DrawWinner<'info> {
    #[account(
        mut,
        constraint = lottery.authority == authority.key() @ LotteryError::Unauthorized
    )]
    pub lottery: Account<'info, Lottery>,
    pub authority: Signer<'info>,
}

#[account]
pub struct Lottery {
    pub authority: Pubkey,
    pub ticket_price: u64,
    pub max_participants: u8,
    pub participants_count: u8,
    pub winner: Option<u8>,
    pub lottery_state: LotteryState,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum LotteryState {
    Created,
    Ready,
    Completed,
}

#[error_code]
pub enum LotteryError {
    #[msg("Operation not allowed in current lottery state")]
    InvalidLotteryState,
    #[msg("Lottery is full")]
    LotteryFull,
    #[msg("Unauthorized")]
    Unauthorized,
}

fn hash(data: &[&[u8]]) -> [u8; 32] {
    use sha2::{Sha256, Digest};
    
    let mut hasher = Sha256::new();
    for d in data {
        hasher.update(d);
    }
    hasher.finalize().into()
}