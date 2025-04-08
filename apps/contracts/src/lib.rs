pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;

use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, pubkey::Pubkey,
    program_error::PrintProgramError,
};

use crate::{
    error::EscrowError,
    processor::Processor,
};

// Program entry point
#[cfg(not(feature = "no-entrypoint"))]
entrypoint!(process_instruction);

/// The main program entrypoint - processes instructions
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    if let Err(error) = Processor::process(program_id, accounts, instruction_data) {
        error.print::<EscrowError>();
        return Err(error);
    }
    Ok(())
}

// Test module
#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::program_error::ProgramError;
    
    // We'll add tests here as we develop the contract
    #[test]
    fn test_validate_instruction() {
        // Simple placeholder test
        assert!(true);
    }
}
