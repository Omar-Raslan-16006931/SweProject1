import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Param, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, TestConfirmDto } from './dto/payment.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { BookingRegistry } from '../../common/booking/booking-registry';

@ApiTags('Payments & Refunds')
@Controller()
export class PaymentsController {
  constructor(
    private readonly service: PaymentsService,
    private readonly registry: BookingRegistry,
    private readonly config: ConfigService,
  ) {}

  @Get('bookings/:type/:id/policies')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'type', enum: ['flight', 'hotel'] })
  @ApiOperation({ summary: "Provider policies to accept before payment (airline: cancellation + baggage; hotel: cancellation + check-in/out) (PAY-02)" })
  policies(@Param('type') type: string, @Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.registry.get(type).getPolicies(id, user);
  }

  @Post('bookings/:type/:id/accept-policies')
  @Roles(Role.USER)
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'type', enum: ['flight', 'hotel'] })
  @ApiOperation({ summary: 'Accept provider policies; stored with a timestamp. Payment is blocked until accepted (PAY-02)' })
  accept(@Param('type') type: string, @Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.registry.get(type).acceptPolicies(id, user);
  }

  @Post('payments')
  @Roles(Role.USER)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Create a Stripe PaymentIntent for a Pending Payment booking within its hold; returns clientSecret for Stripe Elements (PAY-01)',
  })
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Post('payments/:id/retry')
  @Roles(Role.USER)
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Retry a failed payment until the hold expires (PAY-01)' })
  retry(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.retry(id, user);
  }

  @Get('payments/:id')
  @Roles(Role.USER, Role.ADMIN)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Payment status (PAY-01)' })
  get(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(id, user);
  }

  @Post('payments/:id/test-confirm')
  @Roles(Role.USER)
  @HttpCode(200)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'DEV/TEST ONLY: confirm the PaymentIntent with a Stripe test payment method to demo the flow from Swagger',
    description: 'Disabled when NODE_ENV=production or ENABLE_TEST_PAYMENT_ENDPOINT=false. The booking is still confirmed only by the Stripe webhook (PAY-01).',
  })
  testConfirm(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: TestConfirmDto, @CurrentUser() user: AuthUser) {
    if (!this.config.get<boolean>('enableTestPaymentEndpoint')) {
      throw new ForbiddenException({ message: 'Test payment confirmation is disabled in this environment' });
    }
    return this.service.testConfirm(id, user, dto.paymentMethod);
  }

  @Public()
  @Post('payments/webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stripe webhook: verifies signature, confirms bookings and updates refunds (PAY-01, PAY-03)' })
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    return this.service.handleWebhook(req.rawBody, signature);
  }

  @Get('refunds/:id')
  @Roles(Role.USER, Role.ADMIN)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Refund status: Pending, Refunded or Failed (PAY-03)' })
  refund(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.getRefund(id, user);
  }
}
