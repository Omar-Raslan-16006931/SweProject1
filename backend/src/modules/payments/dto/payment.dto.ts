import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsMongoId, IsOptional } from 'class-validator';
import { BookingType } from '../../../common/enums';

export class CreatePaymentDto {
  @ApiProperty({ enum: BookingType, example: BookingType.FLIGHT })
  @IsEnum(BookingType)
  bookingType: BookingType;

  @ApiProperty({ description: 'Id of a Pending Payment flight booking or hotel reservation' })
  @IsMongoId()
  bookingId: string;
}

export class TestConfirmDto {
  @ApiPropertyOptional({
    enum: ['pm_card_visa', 'pm_card_chargeDeclined', 'pm_card_visa_chargeDeclinedInsufficientFunds'],
    default: 'pm_card_visa',
    description: "Stripe's built-in test payment methods (no card data involved)",
  })
  @IsOptional()
  @IsIn(['pm_card_visa', 'pm_card_chargeDeclined', 'pm_card_visa_chargeDeclinedInsufficientFunds'])
  paymentMethod?: string;
}
