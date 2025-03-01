export const config = {
    server: {
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development'
    },
    solana: {
        endpoint: process.env.SOLANA_ENDPOINT || 'https://api.devnet.solana.com',
        programId: process.env.SOLANA_PROGRAM_ID
    }
};
