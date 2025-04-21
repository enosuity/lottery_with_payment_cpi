use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("7XwiKzqquh4ffNo9LeTMopSTgJeXtHWNXopBBLtJZ4sq");

#[program]
pub mod payment_management {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let payment_manager = &mut ctx.accounts.payment_manager;
        payment_manager.authority = ctx.accounts.authority.key();
        Ok(())
    }

    // The transfer function that will be called via CPI from the lottery program
    pub fn transfer(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
        // Transfer tokens from the from_account to the to_account
        let cpi_accounts = Transfer {
            from: ctx.accounts.from_account.to_account_info(),
            to: ctx.accounts.to_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, amount)?;
        
        // Log the transfer
        msg!("Transferred {} tokens", amount);
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 // 8 bytes for discriminator + 32 bytes for pubkey
    )]
    pub payment_manager: Account<'info, PaymentManager>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    #[account(mut)]
    pub from_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to_account: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct PaymentManager {
    pub authority: Pubkey,
}
