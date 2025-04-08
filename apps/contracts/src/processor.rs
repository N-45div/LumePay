use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    rent::Rent,
    sysvar::{clock::Clock, Sysvar},
};
use spl_token::state::Account as TokenAccount;

use crate::{error::EscrowError, instruction::EscrowInstruction, state::{Escrow, EscrowState}};

pub struct Processor;

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = EscrowInstruction::try_from_slice(instruction_data)
            .map_err(|_| EscrowError::InvalidInstruction)?;

        match instruction {
            EscrowInstruction::Initialize {
                amount,
                release_timestamp,
                dispute_time_window,
                listing_id,
            } => {
                msg!("Instruction: Initialize Escrow");
                Self::process_initialize(
                    program_id,
                    accounts,
                    amount,
                    release_timestamp,
                    dispute_time_window,
                    listing_id,
                )
            }
            EscrowInstruction::Fund { transaction_signature } => {
                msg!("Instruction: Fund Escrow");
                Self::process_fund(program_id, accounts, transaction_signature)
            }
            EscrowInstruction::Release { transaction_signature } => {
                msg!("Instruction: Release Escrow");
                Self::process_release(program_id, accounts, transaction_signature)
            }
            EscrowInstruction::Refund { transaction_signature } => {
                msg!("Instruction: Refund Escrow");
                Self::process_refund(program_id, accounts, transaction_signature)
            }
            EscrowInstruction::Dispute { reason } => {
                msg!("Instruction: Dispute Escrow");
                Self::process_dispute(program_id, accounts, reason)
            }
        }
    }

    fn process_initialize(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
        release_timestamp: i64,
        dispute_time_window: i64,
        listing_id: [u8; 32],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let seller = next_account_info(account_info_iter)?;
        let escrow_account = next_account_info(account_info_iter)?;
        let seller_token_account = next_account_info(account_info_iter)?;
        let buyer = next_account_info(account_info_iter)?;
        let buyer_token_account = next_account_info(account_info_iter)?;
        let escrow_token_account = next_account_info(account_info_iter)?;
        let rent_info = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !seller.is_signer {
            return Err(EscrowError::Unauthorized.into());
        }

        if !buyer.is_signer {
            return Err(EscrowError::Unauthorized.into());
        }

        let rent = &Rent::from_account_info(rent_info)?;
        if !rent.is_exempt(escrow_account.lamports(), escrow_account.data_len()) {
            return Err(EscrowError::NotRentExempt.into());
        }

        // Get the current timestamp from the clock
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;

        // Validate release timestamp (must be in the future)
        if release_timestamp <= current_timestamp {
            return Err(EscrowError::ReleaseTimeNotReached.into());
        }

        // Create escrow data
        let escrow_data = Escrow {
            is_initialized: true,
            seller_pubkey: *seller.key,
            buyer_pubkey: *buyer.key,
            seller_token_account: *seller_token_account.key,
            buyer_token_account: *buyer_token_account.key,
            escrow_token_account: *escrow_token_account.key,
            amount,
            state: EscrowState::Created,
            creation_timestamp: current_timestamp,
            release_timestamp,
            dispute_time_window,
            listing_id,
            transaction_signature: [0; 64],
        };

        escrow_data.serialize(&mut *escrow_account.data.borrow_mut())?;

        msg!("Escrow account initialized successfully");
        Ok(())
    }

    fn process_fund(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        transaction_signature: [u8; 64],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let buyer = next_account_info(account_info_iter)?;
        let escrow_account = next_account_info(account_info_iter)?;
        let buyer_token_account = next_account_info(account_info_iter)?;
        let escrow_token_account = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;

        if !buyer.is_signer {
            return Err(EscrowError::Unauthorized.into());
        }

        let mut escrow_data = Escrow::try_from_slice(&escrow_account.data.borrow())?;
        
        // Check that we're in the correct state
        if escrow_data.state != EscrowState::Created {
            return Err(EscrowError::InvalidEscrowState.into());
        }

        // Verify buyer is the correct one for this escrow
        if escrow_data.buyer_pubkey != *buyer.key {
            return Err(EscrowError::Unauthorized.into());
        }

        // Verify token accounts match what's stored in escrow
        if escrow_data.buyer_token_account != *buyer_token_account.key {
            return Err(EscrowError::InvalidTokenAccount.into());
        }

        if escrow_data.escrow_token_account != *escrow_token_account.key {
            return Err(EscrowError::InvalidTokenAccount.into());
        }

        // Transfer tokens from buyer to escrow account
        let transfer_instruction = spl_token::instruction::transfer(
            token_program.key,
            buyer_token_account.key,
            escrow_token_account.key,
            buyer.key,
            &[],
            escrow_data.amount,
        )?;

        invoke(
            &transfer_instruction,
            &[
                buyer_token_account.clone(),
                escrow_token_account.clone(),
                buyer.clone(),
                token_program.clone(),
            ],
        )?;

        // Update escrow state to FUNDED
        escrow_data.state = EscrowState::Funded;
        escrow_data.transaction_signature = transaction_signature;
        escrow_data.serialize(&mut *escrow_account.data.borrow_mut())?;

        msg!("Escrow funded successfully with {} tokens", escrow_data.amount);
        Ok(())
    }

    fn process_release(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        transaction_signature: [u8; 64],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let seller = next_account_info(account_info_iter)?;
        let escrow_account = next_account_info(account_info_iter)?;
        let escrow_token_account = next_account_info(account_info_iter)?;
        let seller_token_account = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        let clock = next_account_info(account_info_iter)?;
        
        if !seller.is_signer {
            return Err(EscrowError::Unauthorized.into());
        }

        let mut escrow_data = Escrow::try_from_slice(&escrow_account.data.borrow())?;
        
        // Verify seller is the correct one for this escrow
        if escrow_data.seller_pubkey != *seller.key {
            return Err(EscrowError::Unauthorized.into());
        }

        // Get the current timestamp
        let current_timestamp = Clock::from_account_info(clock)?.unix_timestamp;

        // Check if the escrow can be released
        if !escrow_data.can_release(current_timestamp) {
            return Err(EscrowError::InvalidEscrowState.into());
        }

        // Verify token accounts match what's stored in escrow
        if escrow_data.seller_token_account != *seller_token_account.key {
            return Err(EscrowError::InvalidTokenAccount.into());
        }

        if escrow_data.escrow_token_account != *escrow_token_account.key {
            return Err(EscrowError::InvalidTokenAccount.into());
        }

        // Transfer tokens from escrow to seller account
        let transfer_instruction = spl_token::instruction::transfer(
            token_program.key,
            escrow_token_account.key,
            seller_token_account.key,
            escrow_account.key, // Authority of the escrow token account
            &[],
            escrow_data.amount,
        )?;

        // Since the escrow account is PDA of the program, use invoke_signed
        let escrow_seed = &[
            b"escrow",
            escrow_data.seller_pubkey.as_ref(),
            escrow_data.buyer_pubkey.as_ref(),
            escrow_data.listing_id.as_ref(),
            &[0],
        ];

        invoke_signed(
            &transfer_instruction,
            &[
                escrow_token_account.clone(),
                seller_token_account.clone(),
                escrow_account.clone(),
                token_program.clone(),
            ],
            &[escrow_seed],
        )?;

        // Update escrow state to RELEASED
        escrow_data.state = EscrowState::Released;
        escrow_data.transaction_signature = transaction_signature;
        escrow_data.serialize(&mut *escrow_account.data.borrow_mut())?;

        msg!("Escrow released successfully");
        Ok(())
    }

    fn process_refund(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        transaction_signature: [u8; 64],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let seller = next_account_info(account_info_iter)?;
        let escrow_account = next_account_info(account_info_iter)?;
        let escrow_token_account = next_account_info(account_info_iter)?;
        let buyer_token_account = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        let clock = next_account_info(account_info_iter)?;
        
        if !seller.is_signer {
            return Err(EscrowError::Unauthorized.into());
        }

        let mut escrow_data = Escrow::try_from_slice(&escrow_account.data.borrow())?;
        
        // Verify seller is the correct one for this escrow
        if escrow_data.seller_pubkey != *seller.key {
            return Err(EscrowError::Unauthorized.into());
        }

        // Get the current timestamp
        let current_timestamp = Clock::from_account_info(clock)?.unix_timestamp;

        // Check if the escrow can be refunded
        if !escrow_data.can_refund(current_timestamp) {
            return Err(EscrowError::InvalidEscrowState.into());
        }

        // Verify token accounts match what's stored in escrow
        if escrow_data.buyer_token_account != *buyer_token_account.key {
            return Err(EscrowError::InvalidTokenAccount.into());
        }

        if escrow_data.escrow_token_account != *escrow_token_account.key {
            return Err(EscrowError::InvalidTokenAccount.into());
        }

        // Transfer tokens from escrow to buyer account
        let transfer_instruction = spl_token::instruction::transfer(
            token_program.key,
            escrow_token_account.key,
            buyer_token_account.key,
            escrow_account.key, // Authority of the escrow token account
            &[],
            escrow_data.amount,
        )?;

        // Since the escrow account is PDA of the program, use invoke_signed
        let escrow_seed = &[
            b"escrow",
            escrow_data.seller_pubkey.as_ref(),
            escrow_data.buyer_pubkey.as_ref(),
            escrow_data.listing_id.as_ref(),
            &[0],
        ];

        invoke_signed(
            &transfer_instruction,
            &[
                escrow_token_account.clone(),
                buyer_token_account.clone(),
                escrow_account.clone(),
                token_program.clone(),
            ],
            &[escrow_seed],
        )?;

        // Update escrow state to REFUNDED
        escrow_data.state = EscrowState::Refunded;
        escrow_data.transaction_signature = transaction_signature;
        escrow_data.serialize(&mut *escrow_account.data.borrow_mut())?;

        msg!("Escrow refunded successfully");
        Ok(())
    }

    fn process_dispute(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        reason: String,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let buyer = next_account_info(account_info_iter)?;
        let escrow_account = next_account_info(account_info_iter)?;
        let clock = next_account_info(account_info_iter)?;
        
        if !buyer.is_signer {
            return Err(EscrowError::Unauthorized.into());
        }

        let mut escrow_data = Escrow::try_from_slice(&escrow_account.data.borrow())?;
        
        // Verify buyer is the correct one for this escrow
        if escrow_data.buyer_pubkey != *buyer.key {
            return Err(EscrowError::Unauthorized.into());
        }

        // Get the current timestamp
        let current_timestamp = Clock::from_account_info(clock)?.unix_timestamp;

        // Check if the escrow can be disputed
        if !escrow_data.can_dispute(current_timestamp) {
            return Err(EscrowError::InvalidEscrowState.into());
        }

        // Update escrow state to DISPUTED
        escrow_data.state = EscrowState::Disputed;
        escrow_data.serialize(&mut *escrow_account.data.borrow_mut())?;

        msg!("Escrow disputed successfully: {}", reason);
        Ok(())
    }
}
