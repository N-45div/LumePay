import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  UseGuards,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { SolanaWalletService } from '../../services/blockchain/solana/wallet.service';
import { 
  WalletDetails, 
  WalletType,
  WalletStatus,
  TokenBalance, 
  SolanaTransactionParams,
  SolanaTransactionResult 
} from '../../services/blockchain/solana/interfaces/wallet.interface';
import { AuthGuard } from '../guards/auth.guard';
class CreateWalletDto {
  type: WalletType = WalletType.USER;
  label?: string;
  metadata?: Record<string, any>;
}
class TransferSolDto {
  toAddress: string;
  amount: number;
  reference?: string;
  metadata?: Record<string, any>;
}
class TransferTokenDto extends TransferSolDto {
  token: string; // Mint address of the token
}
class SignMessageDto {
  message: string;
}
@Controller('api/solana/wallets')
@UseGuards(AuthGuard)
export class SolanaWalletController {
  constructor(private solanaWalletService: SolanaWalletService) {}
  @Get()
  async getUserWallets(): Promise<{ wallets: WalletDetails[] }> {
    const userId = 'mock-user-id';
    try {
      const wallets = await this.solanaWalletService.getUserWallets(userId);
      return { wallets };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  @Get(':id')
  async getWallet(@Param('id') id: string): Promise<{ wallet: WalletDetails }> {
    try {
      const wallet = await this.solanaWalletService.getWallet(id);
      return { wallet };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        errorMessage,
        HttpStatus.NOT_FOUND
      );
    }
  }
  @Post()
  async createWallet(@Body() dto: CreateWalletDto): Promise<{ wallet: WalletDetails }> {
    const userId = 'mock-user-id';
    try {
      const wallet = await this.solanaWalletService.createWallet({
        userId,
        type: dto.type,
        label: dto.label,
        metadata: dto.metadata
      });
      return { wallet };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        errorMessage,
        HttpStatus.BAD_REQUEST
      );
    }
  }
  @Get(':id/balances/sol')
  async getSolBalance(@Param('id') id: string): Promise<{ balance: number }> {
    try {
      const balance = await this.solanaWalletService.getSolBalance(id);
      return { balance };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        errorMessage,
        error instanceof Error && error.message.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  @Get(':id/balances/tokens')
  async getTokenBalances(@Param('id') id: string): Promise<{ balances: TokenBalance[] }> {
    try {
      const balances = await this.solanaWalletService.getTokenBalances(id);
      return { balances };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        errorMessage,
        error instanceof Error && error.message.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  @Post(':id/transfer/sol')
  async transferSol(
    @Param('id') id: string,
    @Body() dto: TransferSolDto
  ): Promise<{ transaction: SolanaTransactionResult }> {
    try {
      const result = await this.solanaWalletService.transferSol({
        fromWalletId: id,
        toAddress: dto.toAddress,
        amount: dto.amount,
        reference: dto.reference,
        metadata: dto.metadata
      });
      if (!result.success) {
        throw new HttpException(
          result.error.message,
          HttpStatus.BAD_REQUEST
        );
      }
      return { transaction: result };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        errorMessage,
        HttpStatus.BAD_REQUEST
      );
    }
  }
  @Post(':id/transfer/token')
  async transferToken(
    @Param('id') id: string,
    @Body() dto: TransferTokenDto
  ): Promise<{ transaction: SolanaTransactionResult }> {
    try {
      const result = await this.solanaWalletService.transferToken({
        fromWalletId: id,
        toAddress: dto.toAddress,
        amount: dto.amount,
        token: dto.token,
        reference: dto.reference,
        metadata: dto.metadata
      });
      if (!result.success) {
        throw new HttpException(
          result.error.message,
          HttpStatus.BAD_REQUEST
        );
      }
      return { transaction: result };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        errorMessage,
        HttpStatus.BAD_REQUEST
      );
    }
  }
  @Post(':id/sign')
  async signMessage(
    @Param('id') id: string,
    @Body() dto: SignMessageDto
  ): Promise<{ signature: string }> {
    try {
      const result = await this.solanaWalletService.signMessage(id, dto.message);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        errorMessage,
        HttpStatus.BAD_REQUEST
      );
    }
  }
  @Post(':id/status/:status')
  async changeWalletStatus(
    @Param('id') id: string,
    @Param('status') status: string
  ): Promise<{ wallet: WalletDetails }> {
    try {
      if (!Object.values(WalletStatus).includes(status as WalletStatus)) {
        throw new Error(`Invalid status: ${status}`);
      }
      const wallet = await this.solanaWalletService.changeWalletStatus(id, status as WalletStatus);
      return { wallet };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new HttpException(
        errorMessage,
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
