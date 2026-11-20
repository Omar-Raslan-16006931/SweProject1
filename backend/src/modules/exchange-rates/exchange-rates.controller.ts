import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ExchangeRatesService } from './exchange-rates.service';

@ApiTags('Exchange Rates')
@Public()
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly service: ExchangeRatesService) {}

  @Get()
  @ApiOperation({ summary: 'Current cached exchange rates (base USD) and the rate date (ITN-18)' })
  rates() {
    return this.service.getRates();
  }

  @Get('convert')
  @ApiOperation({ summary: 'Convert an amount between supported currencies (ITN-18)' })
  @ApiQuery({ name: 'amount', example: 100 })
  @ApiQuery({ name: 'from', example: 'EUR' })
  @ApiQuery({ name: 'to', example: 'EGP' })
  convert(@Query('amount') amount: string, @Query('from') from: string, @Query('to') to: string) {
    return this.service.convertAmount(Number(amount), from ?? '', to ?? '');
  }
}
