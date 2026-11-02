import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ReferenceService } from './reference.service';

@ApiTags('Reference Data')
@Public()
@Controller()
export class ReferenceController {
  constructor(private readonly ref: ReferenceService) {}

  @Get('airports')
  @ApiOperation({ summary: 'List predefined airports (FLT-02, FLT-03, FLT-11)' })
  @ApiQuery({ name: 'cityId', required: false })
  airports(@Query('cityId') cityId?: string) {
    return this.ref.listAirports(cityId);
  }

  @Get('countries')
  @ApiOperation({ summary: 'List predefined countries (GEN-12, ITN-01)' })
  countries() {
    return this.ref.listCountries();
  }

  @Get('cities')
  @ApiOperation({ summary: 'List predefined cities (GEN-12, ITN-05, HTL-01)' })
  @ApiQuery({ name: 'countryCode', required: false })
  cities(@Query('countryCode') countryCode?: string) {
    return this.ref.listCities(countryCode);
  }

  @Get('currencies')
  @ApiOperation({ summary: 'List supported currencies (GEN-12, ACC-09, ITN-18)' })
  currencies() {
    return this.ref.listCurrencies();
  }

  @Get('attractions')
  @ApiOperation({ summary: 'List reference attractions (PDF 5.1 reference dataset)' })
  @ApiQuery({ name: 'cityId', required: false })
  attractions(@Query('cityId') cityId?: string) {
    return this.ref.listAttractions(cityId);
  }
}
