use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program, sysvar,
};

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub enum EscrowInstruction {
    /// Initialize a new escrow
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The seller's account
    /// 1. `[writable]` The escrow account, PDA owned by the program
    /// 2. `[]` The seller's token account to eventually receive payment
    /// 3. `[signer]` The buyer's account
    /// 4. `[]` The buyer's token account to pay from
    /// 5. `[]` The escrow token account, holds funds during escrow period
    /// 6. `[]` The rent sysvar
    /// 7. `[]` The system program
    Initialize {
        /// Amount of tokens to be escrowed
        amount: u64,
        /// Time after which the seller can release funds (Unix timestamp)
        release_timestamp: i64,
        /// Window of time for buyer to dispute after creation (in seconds)
        dispute_time_window: i64,
        /// Marketplace listing ID (32 bytes)
        listing_id: [u8; 32],
    },

    /// Fund an escrow with tokens
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The buyer's account
    /// 1. `[writable]` The escrow account, PDA owned by the program
    /// 2. `[writable]` The buyer's token account to pay from
    /// 3. `[writable]` The escrow token account to receive funds
    /// 4. `[]` The token program
    Fund {
        /// Transaction signature (64 bytes)
        transaction_signature: [u8; 64],
    },

    /// Release funds from escrow to the seller
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The seller's account
    /// 1. `[writable]` The escrow account, PDA owned by the program
    /// 2. `[writable]` The escrow token account to send from
    /// 3. `[writable]` The seller's token account to receive funds
    /// 4. `[]` The token program
    /// 5. `[]` The clock sysvar
    Release {
        /// Transaction signature (64 bytes)
        transaction_signature: [u8; 64],
    },

    /// Refund funds from escrow to the buyer
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The seller's account
    /// 1. `[writable]` The escrow account, PDA owned by the program
    /// 2. `[writable]` The escrow token account to send from
    /// 3. `[writable]` The buyer's token account to receive refund
    /// 4. `[]` The token program
    /// 5. `[]` The clock sysvar
    Refund {
        /// Transaction signature (64 bytes)
        transaction_signature: [u8; 64],
    },

    /// Mark an escrow as disputed, to be resolved by admin/arbitrator
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The buyer's account
    /// 1. `[writable]` The escrow account, PDA owned by the program
    /// 2. `[]` The clock sysvar
    Dispute {
        /// Reason for dispute (short string)
        reason: String,
    },
}

impl EscrowInstruction {
    /// Creates an 'Initialize' instruction
    pub fn initialize(
        program_id: &Pubkey,
        seller: &Pubkey,
        escrow_account: &Pubkey,
        seller_token_account: &Pubkey,
        buyer: &Pubkey,
        buyer_token_account: &Pubkey,
        escrow_token_account: &Pubkey,
        amount: u64,
        release_timestamp: i64,
        dispute_time_window: i64,
        listing_id: [u8; 32],
    ) -> Instruction {
        let data = EscrowInstruction::Initialize {
            amount,
            release_timestamp,
            dispute_time_window,
            listing_id,
        }
        .try_to_vec()
        .unwrap();

        Instruction {
            program_id: *program_id,
            accounts: vec![
                AccountMeta::new_readonly(*seller, true),
                AccountMeta::new(*escrow_account, false),
                AccountMeta::new_readonly(*seller_token_account, false),
                AccountMeta::new_readonly(*buyer, true),
                AccountMeta::new_readonly(*buyer_token_account, false),
                AccountMeta::new_readonly(*escrow_token_account, false),
                AccountMeta::new_readonly(sysvar::rent::id(), false),
                AccountMeta::new_readonly(system_program::id(), false),
            ],
            data,
        }
    }

    /// Creates a 'Fund' instruction
    pub fn fund(
        program_id: &Pubkey,
        buyer: &Pubkey,
        escrow_account: &Pubkey,
        buyer_token_account: &Pubkey,
        escrow_token_account: &Pubkey,
        token_program: &Pubkey,
        transaction_signature: [u8; 64],
    ) -> Instruction {
        let data = EscrowInstruction::Fund {
            transaction_signature,
        }
        .try_to_vec()
        .unwrap();

        Instruction {
            program_id: *program_id,
            accounts: vec![
                AccountMeta::new_readonly(*buyer, true),
                AccountMeta::new(*escrow_account, false),
                AccountMeta::new(*buyer_token_account, false),
                AccountMeta::new(*escrow_token_account, false),
                AccountMeta::new_readonly(*token_program, false),
            ],
            data,
        }
    }

    /// Creates a 'Release' instruction
    pub fn release(
        program_id: &Pubkey,
        seller: &Pubkey,
        escrow_account: &Pubkey,
        escrow_token_account: &Pubkey,
        seller_token_account: &Pubkey,
        token_program: &Pubkey,
        transaction_signature: [u8; 64],
    ) -> Instruction {
        let data = EscrowInstruction::Release {
            transaction_signature,
        }
        .try_to_vec()
        .unwrap();

        Instruction {
            program_id: *program_id,
            accounts: vec![
                AccountMeta::new_readonly(*seller, true),
                AccountMeta::new(*escrow_account, false),
                AccountMeta::new(*escrow_token_account, false),
                AccountMeta::new(*seller_token_account, false),
                AccountMeta::new_readonly(*token_program, false),
                AccountMeta::new_readonly(sysvar::clock::id(), false),
            ],
            data,
        }
    }

    /// Creates a 'Refund' instruction
    pub fn refund(
        program_id: &Pubkey,
        seller: &Pubkey,
        escrow_account: &Pubkey,
        escrow_token_account: &Pubkey,
        buyer_token_account: &Pubkey,
        token_program: &Pubkey,
        transaction_signature: [u8; 64],
    ) -> Instruction {
        let data = EscrowInstruction::Refund {
            transaction_signature,
        }
        .try_to_vec()
        .unwrap();

        Instruction {
            program_id: *program_id,
            accounts: vec![
                AccountMeta::new_readonly(*seller, true),
                AccountMeta::new(*escrow_account, false),
                AccountMeta::new(*escrow_token_account, false),
                AccountMeta::new(*buyer_token_account, false),
                AccountMeta::new_readonly(*token_program, false),
                AccountMeta::new_readonly(sysvar::clock::id(), false),
            ],
            data,
        }
    }

    /// Creates a 'Dispute' instruction
    pub fn dispute(
        program_id: &Pubkey,
        buyer: &Pubkey,
        escrow_account: &Pubkey,
        reason: String,
    ) -> Instruction {
        let data = EscrowInstruction::Dispute { reason }
            .try_to_vec()
            .unwrap();

        Instruction {
            program_id: *program_id,
            accounts: vec![
                AccountMeta::new_readonly(*buyer, true),
                AccountMeta::new(*escrow_account, false),
                AccountMeta::new_readonly(sysvar::clock::id(), false),
            ],
            data,
        }
    }
}
