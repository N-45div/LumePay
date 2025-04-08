use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    program_pack::{IsInitialized, Sealed},
    pubkey::Pubkey,
};

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
pub enum EscrowState {
    Uninitialized,
    Created,
    Funded,
    Released,
    Refunded,
    Disputed,
    Closed,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Escrow {
    pub is_initialized: bool,
    pub seller_pubkey: Pubkey,
    pub buyer_pubkey: Pubkey,
    pub seller_token_account: Pubkey,
    pub buyer_token_account: Pubkey,
    pub escrow_token_account: Pubkey,
    pub amount: u64,
    pub state: EscrowState,
    pub creation_timestamp: i64,
    pub release_timestamp: i64,
    pub dispute_time_window: i64,
    pub listing_id: [u8; 32],
    pub transaction_signature: [u8; 64],
}

impl Sealed for Escrow {}

impl IsInitialized for Escrow {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Escrow {
    pub fn can_release(&self, current_timestamp: i64) -> bool {
        match self.state {
            EscrowState::Funded => true,
            EscrowState::Disputed => current_timestamp >= self.release_timestamp,
            _ => false,
        }
    }

    pub fn can_refund(&self, current_timestamp: i64) -> bool {
        match self.state {
            EscrowState::Funded => true,
            EscrowState::Disputed => current_timestamp >= self.release_timestamp,
            _ => false,
        }
    }

    pub fn can_dispute(&self, current_timestamp: i64) -> bool {
        match self.state {
            EscrowState::Funded => current_timestamp < self.creation_timestamp + self.dispute_time_window,
            _ => false,
        }
    }
}
