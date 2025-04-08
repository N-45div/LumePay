use solana_program::program_error::ProgramError;
use thiserror::Error;

#[derive(Error, Debug, Copy, Clone)]
pub enum EscrowError {
    #[error("Invalid instruction")]
    InvalidInstruction,
    
    #[error("Not rent exempt")]
    NotRentExempt,
    
    #[error("Expected amount mismatch")]
    ExpectedAmountMismatch,
    
    #[error("Amount overflow")]
    AmountOverflow,
    
    #[error("Unauthorized user")]
    Unauthorized,
    
    #[error("Escrow not in correct state")]
    InvalidEscrowState,
    
    #[error("Escrow already initialized")]
    EscrowAlreadyInitialized,
    
    #[error("Invalid token account")]
    InvalidTokenAccount,
    
    #[error("Invalid PDA derivation")]
    InvalidPDA,
    
    #[error("Release time not reached")]
    ReleaseTimeNotReached,
    
    #[error("Escrow already completed")]
    EscrowAlreadyCompleted,
    
    #[error("Invalid recipient")]
    InvalidRecipient,
}

impl From<EscrowError> for ProgramError {
    fn from(e: EscrowError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
