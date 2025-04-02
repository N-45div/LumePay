import { Controller, Post, Get, Body, Param, UseGuards, HttpException, HttpStatus, Query } from '@nestjs/common';
import { ConversionService } from '../../services/core/conversion/conversion.service';
import { Logger } from '../../utils/logger';
import { createSuccessResult } from '../../common/types/result.types';
export class ConversionRequestDto {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
}
export class ExchangeRateRequestDto {
  fromCurrency: string;
  toCurrency: string;
}
@Controller('conversion')
export class ConversionController {
  constructor(
    private readonly conversionService: ConversionService,
    private readonly logger: Logger
  ) {}
  @Post('fiat-to-crypto')
  async convertFiatToCrypto(
    @Body() request: ConversionRequestDto
  ) {
    const userId = "current-user"; // In a real app, you'd get this from auth
    this.logger.info(`User ${userId} converting ${request.amount} ${request.fromCurrency} to ${request.toCurrency}`);
    const result = await this.conversionService.convertFiatToCrypto(
      userId,
      request.amount,
      request.fromCurrency,
      request.toCurrency
    );
    if (!result.success) {
      throw new HttpException(
        result.error?.message || 'Conversion failed', 
        HttpStatus.BAD_REQUEST
      );
    }
    return createSuccessResult(result.data);
  }
  @Post('crypto-to-fiat')
  async convertCryptoToFiat(
    @Body() request: ConversionRequestDto
  ) {
    const userId = "current-user"; // In a real app, you'd get this from auth
    this.logger.info(`User ${userId} converting ${request.amount} ${request.fromCurrency} to ${request.toCurrency}`);
    const result = await this.conversionService.convertCryptoToFiat(
      userId,
      request.amount,
      request.fromCurrency,
      request.toCurrency
    );
    if (!result.success) {
      throw new HttpException(
        result.error?.message || 'Conversion failed', 
        HttpStatus.BAD_REQUEST
      );
    }
    return createSuccessResult(result.data);
  }
  @Get('fiat-currencies')
  async getSupportedFiatCurrencies() {
    try {
      const currencies = await this.conversionService.getSupportedFiatCurrencies();
      return createSuccessResult(currencies);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new HttpException(
        errorMessage || 'Failed to get supported fiat currencies',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  @Get('crypto-currencies')
  async getSupportedCryptoCurrencies() {
    try {
      const currencies = await this.conversionService.getSupportedCryptoCurrencies();
      return createSuccessResult(currencies);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new HttpException(
        errorMessage || 'Failed to get supported crypto currencies',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  @Get('estimate')
  async getEstimatedConversion(
    @Query('amount') amount: number,
    @Query('fromCurrency') fromCurrency: string,
    @Query('toCurrency') toCurrency: string
  ) {
    try {
      if (!amount || !fromCurrency || !toCurrency) {
        throw new HttpException(
          'Missing required parameters: amount, fromCurrency, toCurrency',
          HttpStatus.BAD_REQUEST
        );
      }
      const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
      const rateResult = await this.conversionService.getExchangeRate(fromCurrency, toCurrency);
      if (!rateResult.success || !rateResult.data) {
        throw new HttpException(
          rateResult.error?.message || 'Failed to get exchange rate', 
          HttpStatus.BAD_REQUEST
        );
      }
      const rate = rateResult.data.rate;
      const convertedAmount = parsedAmount * rate;
      const isFiatToCrypto = (await this.conversionService.getSupportedFiatCurrencies()).includes(fromCurrency.toUpperCase()) &&
                            (await this.conversionService.getSupportedCryptoCurrencies()).includes(toCurrency.toUpperCase());
      return createSuccessResult({
        fromAmount: parsedAmount,
        fromCurrency: fromCurrency,
        toAmount: convertedAmount,
        toCurrency: toCurrency,
        rate: rate,
        fee: parsedAmount * (isFiatToCrypto ? 0.01 : 0.005) // Simplified fee calculation
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const statusCode = error instanceof HttpException ? (error as HttpException).getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
      this.logger.error(`Error estimating conversion: ${errorMessage}`, {
        error: errorMessage,
        fromCurrency,
        toCurrency,
        amount
      });
      throw new HttpException(
        errorMessage || 'Failed to estimate conversion',
        statusCode
      );
    }
  }
}
