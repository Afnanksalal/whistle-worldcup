use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("2HksLYwcJhcBuJQtBLauQaViE6zBRv1CWuQoYyeE1ioK");

pub const TXORACLE_DEVNET: Pubkey = pubkey!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
pub const MAX_FEE_BPS: u16 = 1_000;

#[program]
pub mod whistle {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, WhistleError::InvalidFeeBps);
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.usdc_mint = ctx.accounts.usdc_mint.key();
        config.fee_bps = fee_bps;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn create_market(
        ctx: Context<CreateMarket>,
        fixture_id: String,
        identity_seed: [u8; 32],
        market_type: u8,
        line_x100: u32,
        kickoff_ts: i64,
    ) -> Result<()> {
        require!(fixture_id.len() <= 64, WhistleError::FixtureIdTooLong);
        // 0 = match_result, 1 = total_goals, 2 = total_corners
        require!(market_type <= 2, WhistleError::InvalidMarketType);
        require!(
            kickoff_ts > Clock::get()?.unix_timestamp,
            WhistleError::InvalidKickoff
        );

        let market = &mut ctx.accounts.market;
        market.bump = ctx.bumps.market;
        market.vault_bump = ctx.bumps.market_vault;
        market.authority = ctx.accounts.authority.key();
        market.fixture_id = fixture_id;
        market.identity_seed = identity_seed;
        market.market_type = market_type;
        market.line_x100 = line_x100;
        market.kickoff_ts = kickoff_ts;
        market.status = MarketStatus::Open as u8;
        market.outcome_pools = [0, 0, 0];
        market.total_pool = 0;
        market.winning_outcome = 255;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, outcome: u8, amount: u64) -> Result<()> {
        require!(amount > 0, WhistleError::InvalidAmount);
        let market = &mut ctx.accounts.market;
        require!(
            market.status == MarketStatus::Open as u8,
            WhistleError::MarketNotOpen
        );
        require!(
            Clock::get()?.unix_timestamp < market.kickoff_ts,
            WhistleError::MarketClosed
        );

        let max_outcome = if market.market_type == 0 { 2 } else { 1 };
        require!(outcome <= max_outcome, WhistleError::InvalidOutcome);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token.to_account_info(),
                    to: ctx.accounts.market_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        market.outcome_pools[outcome as usize] = market.outcome_pools[outcome as usize]
            .checked_add(amount)
            .ok_or(WhistleError::MathOverflow)?;
        market.total_pool = market
            .total_pool
            .checked_add(amount)
            .ok_or(WhistleError::MathOverflow)?;

        let position = &mut ctx.accounts.position;
        if position.amount > 0 {
            require!(
                position.outcome == outcome,
                WhistleError::OutcomeCannotChange
            );
        }
        position.bump = ctx.bumps.position;
        position.owner = ctx.accounts.user.key();
        position.market = market.key();
        position.outcome = outcome;
        position.amount = position
            .amount
            .checked_add(amount)
            .ok_or(WhistleError::MathOverflow)?;
        position.claimed = false;
        Ok(())
    }

    /// Settles a market after verifying match outcome.
    ///
    /// When `proof_ix_data` is non-empty, the keeper must also pass
    /// `txoracle_program` + `daily_scores_merkle_roots` and this instruction
    /// CPIs into TxLINE `validate_stat_v2` (instruction bytes pre-built off-chain).
    /// The CPI return data must be the boolean `true`.
    pub fn settle(
        ctx: Context<Settle>,
        home_score: u8,
        away_score: u8,
        validation_ok: bool,
        proof_ix_data: Vec<u8>,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(
            market.status == MarketStatus::Open as u8,
            WhistleError::MarketNotOpen
        );
        require!(validation_ok, WhistleError::ValidationRequired);

        if !proof_ix_data.is_empty() {
            // remaining_accounts[0] = txoracle program, [1] = daily_scores_roots PDA
            require!(
                ctx.remaining_accounts.len() >= 2,
                WhistleError::ValidationRequired
            );
            let txoracle = &ctx.remaining_accounts[0];
            let roots = &ctx.remaining_accounts[1];
            require_keys_eq!(*txoracle.key, TXORACLE_DEVNET);

            let ix = anchor_lang::solana_program::instruction::Instruction {
                program_id: *txoracle.key,
                accounts: vec![
                    anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                        *roots.key,
                        false,
                    ),
                ],
                data: proof_ix_data,
            };
            anchor_lang::solana_program::program::invoke(
                &ix,
                &[txoracle.clone(), roots.clone()],
            )?;
        }

        // Deterministic resolution — same mapping as off-chain keeper
        let winning: u8 = if market.market_type == 0 {
            if home_score > away_score {
                0
            } else if home_score < away_score {
                2
            } else {
                1
            }
        } else {
            // total_goals (1) and total_corners (2): compare sum*100 > line_x100
            let total = (home_score as u16) + (away_score as u16);
            let line = market.line_x100 as u16;
            if total * 100 > line {
                0
            } else {
                1
            }
        };

        market.status = MarketStatus::Settled as u8;
        market.winning_outcome = winning;
        market.home_score = home_score;
        market.away_score = away_score;
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let market = &ctx.accounts.market;
        let is_refund = market.status == MarketStatus::Void as u8;
        require!(
            market.status == MarketStatus::Settled as u8 || is_refund,
            WhistleError::MarketNotSettled
        );

        let position = &mut ctx.accounts.position;
        require!(!position.claimed, WhistleError::AlreadyClaimed);
        require_keys_eq!(position.owner, ctx.accounts.user.key());

        let payout = if is_refund {
            position.amount
        } else if position.outcome == market.winning_outcome {
            let winning_pool = market.outcome_pools[market.winning_outcome as usize];
            require!(winning_pool > 0, WhistleError::EmptyWinningPool);
            (position.amount as u128)
                .checked_mul(market.total_pool as u128)
                .ok_or(WhistleError::MathOverflow)?
                .checked_div(winning_pool as u128)
                .ok_or(WhistleError::MathOverflow)? as u64
        } else {
            0
        };

        position.claimed = true;

        if payout > 0 {
            let fee_bps = if is_refund {
                0
            } else {
                ctx.accounts.config.fee_bps as u64
            };
            let fee_amount = payout
                .checked_mul(fee_bps)
                .ok_or(WhistleError::MathOverflow)?
                .checked_div(10_000)
                .ok_or(WhistleError::MathOverflow)?;
            let user_payout = payout
                .checked_sub(fee_amount)
                .ok_or(WhistleError::MathOverflow)?;

            let seeds: &[&[u8]] = &[
                b"market",
                market.identity_seed.as_ref(),
                &[market.market_type],
                &market.line_x100.to_le_bytes(),
                &[market.bump],
            ];

            // Transfer user portion
            if user_payout > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.market_vault.to_account_info(),
                            to: ctx.accounts.user_token.to_account_info(),
                            authority: ctx.accounts.market.to_account_info(),
                        },
                        &[seeds],
                    ),
                    user_payout,
                )?;
            }

            // Transfer platform fee to admin ATA
            if fee_amount > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.market_vault.to_account_info(),
                            to: ctx.accounts.admin_token.to_account_info(),
                            authority: ctx.accounts.market.to_account_info(),
                        },
                        &[seeds],
                    ),
                    fee_amount,
                )?;
            }
        }
        Ok(())
    }

    pub fn void_market(ctx: Context<VoidMarket>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(
            market.status == MarketStatus::Open as u8,
            WhistleError::MarketNotOpen
        );
        market.status = MarketStatus::Void as u8;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + Config::SIZE,
        seeds = [b"whistle_config"],
        bump
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(
    fixture_id: String,
    identity_seed: [u8; 32],
    market_type: u8,
    line_x100: u32,
    kickoff_ts: i64
)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"whistle_config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = authority,
        space = 8 + Market::SIZE,
        seeds = [b"market", identity_seed.as_ref(), &[market_type], &line_x100.to_le_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = authority,
        seeds = [b"vault", market.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = market
    )]
    pub market_vault: Account<'info, TokenAccount>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, constraint = market.status == MarketStatus::Open as u8)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump = market.vault_bump
    )]
    pub market_vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Position::SIZE,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        constraint = user_token.owner == user.key() @ WhistleError::Unauthorized,
        constraint = user_token.mint == market_vault.mint @ WhistleError::InvalidTokenAccount
    )]
    pub user_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"whistle_config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    #[account(mut, has_one = authority)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [b"whistle_config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, constraint = market.authority == config.authority @ WhistleError::Unauthorized)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump = market.vault_bump
    )]
    pub market_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == user.key() @ WhistleError::Unauthorized,
        constraint = position.market == market.key() @ WhistleError::Unauthorized
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        constraint = user_token.owner == user.key() @ WhistleError::Unauthorized,
        constraint = user_token.mint == config.usdc_mint @ WhistleError::InvalidTokenAccount
    )]
    pub user_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = admin_token.owner == config.authority @ WhistleError::Unauthorized,
        constraint = admin_token.mint == config.usdc_mint @ WhistleError::InvalidTokenAccount
    )]
    pub admin_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct VoidMarket<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"whistle_config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    #[account(mut, has_one = authority)]
    pub market: Account<'info, Market>,
}

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
}
impl Config {
    pub const SIZE: usize = 32 + 32 + 2 + 1;
}

#[account]
pub struct Market {
    pub authority: Pubkey,
    pub fixture_id: String,
    pub identity_seed: [u8; 32],
    pub market_type: u8,
    pub line_x100: u32,
    pub kickoff_ts: i64,
    pub status: u8,
    pub outcome_pools: [u64; 3],
    pub total_pool: u64,
    pub winning_outcome: u8,
    pub home_score: u8,
    pub away_score: u8,
    pub bump: u8,
    pub vault_bump: u8,
}
impl Market {
    pub const SIZE: usize = 32 + 4 + 64 + 32 + 1 + 4 + 8 + 1 + 8 * 3 + 8 + 1 + 1 + 1 + 1 + 1;
}

#[account]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub outcome: u8,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}
impl Position {
    pub const SIZE: usize = 32 + 32 + 1 + 8 + 1 + 1;
}

#[repr(u8)]
pub enum MarketStatus {
    Open = 0,
    Settled = 1,
    Void = 2,
}

#[error_code]
pub enum WhistleError {
    #[msg("Fixture id too long")]
    FixtureIdTooLong,
    #[msg("Invalid market type")]
    InvalidMarketType,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Market not open")]
    MarketNotOpen,
    #[msg("Invalid outcome")]
    InvalidOutcome,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Market not settled")]
    MarketNotSettled,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Empty winning pool")]
    EmptyWinningPool,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Platform fee exceeds the 10% safety limit")]
    InvalidFeeBps,
    #[msg("Kickoff must be in the future")]
    InvalidKickoff,
    #[msg("The market is closed at kickoff")]
    MarketClosed,
    #[msg("An existing position cannot switch outcomes")]
    OutcomeCannotChange,
    #[msg("Settlement requires verified result confirmation")]
    ValidationRequired,
    #[msg("Token account has the wrong owner or mint")]
    InvalidTokenAccount,
}
