import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Put, 
  Delete, 
  UseGuards,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { BankAccountService } from '../../services/core/fiat/bank-account.service';
import { 
  AddBankAccountParams, 
  VerifyMicroDepositsParams, 
  VerifyPlaidParams,
  BankAccountType,
  VerificationMethod
} from '../../services/core/fiat/interfaces/bank-account.interface';
class AddBankAccountDto implements Omit<AddBankAccountParams, 'userId'> {
  accountNumber: string;
  routingNumber: string;
  accountType: BankAccountType;
  accountHolderName: string;
  institutionName: string;
  name?: string;
  verificationMethod?: VerificationMethod;
  metadata?: Record<string, any>;
}
class VerifyMicroDepositsDto {
  amounts: number[];
}
class VerifyPlaidDto {
  publicToken: string;
  plaidAccountId: string;
}
class AuthGuard {}
@Controller('bank-accounts')
@UseGuards(AuthGuard)
export class BankAccountController {
  constructor(private bankAccountService: BankAccountService) {}
  @Get()
  async getUserBankAccounts(): Promise<any> {
    const userId = 'mock-user-id';
    const result = await this.bankAccountService.getUserBankAccounts(userId);
    if (!result.success) {
      throw new HttpException(
        result.error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
    return { accounts: result.data };
  }
  @Get(':id')
  async getBankAccount(@Param('id') id: string): Promise<any> {
    const result = await this.bankAccountService.getBankAccount(id);
    if (!result.success) {
      throw new HttpException(
        result.error.message,
        result.error.code === 'BANK_ACCOUNT_NOT_FOUND' ? 
          HttpStatus.NOT_FOUND : 
          HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
    return { account: result.data };
  }
  @Post()
  async addBankAccount(@Body() dto: AddBankAccountDto): Promise<any> {
    const userId = 'mock-user-id';
    const result = await this.bankAccountService.addBankAccount({
      ...dto,
      userId
    });
    if (!result.success) {
      throw new HttpException(
        result.error.message,
        HttpStatus.BAD_REQUEST
      );
    }
    return { account: result.data };
  }
  @Put(':id/disable')
  async disableBankAccount(@Param('id') id: string): Promise<any> {
    const result = await this.bankAccountService.disableBankAccount(id);
    if (!result.success) {
      throw new HttpException(
        result.error.message,
        result.error.code === 'BANK_ACCOUNT_NOT_FOUND' ? 
          HttpStatus.NOT_FOUND : 
          HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
    return { success: true };
  }
  @Post(':id/verify/micro-deposits')
  async verifyWithMicroDeposits(
    @Param('id') id: string, 
    @Body() dto: VerifyMicroDepositsDto
  ): Promise<any> {
    const result = await this.bankAccountService.verifyWithMicroDeposits({
      accountId: id,
      amounts: dto.amounts
    });
    if (!result.success) {
      throw new HttpException(
        result.error.message,
        result.error.code === 'BANK_ACCOUNT_NOT_FOUND' ? 
          HttpStatus.NOT_FOUND : 
          HttpStatus.BAD_REQUEST
      );
    }
    return { account: result.data };
  }
  @Post(':id/verify/plaid')
  async verifyWithPlaid(
    @Param('id') id: string, 
    @Body() dto: VerifyPlaidDto
  ): Promise<any> {
    const result = await this.bankAccountService.verifyWithPlaid({
      accountId: id,
      publicToken: dto.publicToken,
      plaidAccountId: dto.plaidAccountId
    });
    if (!result.success) {
      throw new HttpException(
        result.error.message,
        result.error.code === 'BANK_ACCOUNT_NOT_FOUND' ? 
          HttpStatus.NOT_FOUND : 
          HttpStatus.BAD_REQUEST
      );
    }
    return { account: result.data };
  }
  @Post(':id/micro-deposits')
  async initiateMicroDeposits(@Param('id') id: string): Promise<any> {
    const result = await this.bankAccountService.initiateMicroDeposits(id);
    if (!result.success) {
      throw new HttpException(
        result.error.message,
        result.error.code === 'BANK_ACCOUNT_NOT_FOUND' ? 
          HttpStatus.NOT_FOUND : 
          HttpStatus.BAD_REQUEST
      );
    }
    return { success: true };
  }
}
