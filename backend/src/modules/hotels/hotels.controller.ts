import {
  Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UploadedFiles, UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { HotelsService } from './hotels.service';
import {
  AvailabilityQueryDto, CreateHotelDto, CreateRoomDto, DateRangeDto, HotelPoliciesDto, HotelSearchDto,
  PatchAvailabilityDto, StayQueryDto, UpdateHotelDto, UpdateRoomDto,
} from './dto/hotel.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ImagesInterceptor, imagesBodySchema } from '../uploads/image-upload';

@ApiTags('Hotels')
@Controller('hotels')
export class HotelsController {
  constructor(private readonly service: HotelsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Admin creates a hotel profile (HTL-01)' })
  create(@Body() dto: CreateHotelDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Search hotels by city/country, dates, guests and rooms; price & rating filters; sort (HTL-11, HTL-12)' })
  search(@Query() q: HotelSearchDto) {
    return this.service.search(q);
  }

  @Public()
  @Get(':id')
  @ApiQuery({ name: 'checkIn', required: false, example: '2026-12-20' })
  @ApiQuery({ name: 'checkOut', required: false, example: '2026-12-23' })
  @ApiOperation({ summary: 'Hotel details: profile, photos, amenities, times, policy, average rating and latest reviews; available rooms when dates given (HTL-02)' })
  details(@Param('id', ParseObjectIdPipe) id: string, @Query('checkIn') checkIn?: string, @Query('checkOut') checkOut?: string) {
    return this.service.details(id, checkIn, checkOut);
  }

  @Patch(':id')
  @Roles(Role.HOTEL_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: "Hotel moderator edits their hotel's profile (HTL-01)" })
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateHotelDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/photos')
  @Roles(Role.HOTEL_MODERATOR)
  @ApiCookieAuth('access_token')
  @UseInterceptors(ImagesInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiBody(imagesBodySchema)
  @ApiOperation({ summary: 'Upload hotel photos: JPG/PNG <= 5 MB each, max 5 per hotel (HTL-01, GEN-08)' })
  photos(@Param('id', ParseObjectIdPipe) id: string, @UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: AuthUser) {
    return this.service.addPhotos(id, files, user);
  }

  @Delete(':id/photos/:photoId')
  @Roles(Role.HOTEL_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Remove a hotel photo (HTL-01, GEN-08)' })
  removePhoto(@Param('id', ParseObjectIdPipe) id: string, @Param('photoId', ParseObjectIdPipe) photoId: string, @CurrentUser() user: AuthUser) {
    return this.service.removePhoto(id, photoId, user);
  }

  @Put(':id/policies')
  @Roles(Role.HOTEL_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Set check-in/check-out times and cancellation tiers (HTL-09, HTL-10)' })
  policies(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: HotelPoliciesDto, @CurrentUser() user: AuthUser) {
    return this.service.setPolicies(id, dto, user);
  }

  @Get(':id/rooms')
  @Roles(Role.HOTEL_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: "List my hotel's rooms with availability and blocks (moderator dashboard support)" })
  rooms(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.service.listRooms(id, user, q.page);
  }

  @Post(':id/rooms')
  @Roles(Role.HOTEL_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Add a room: number/name unique in hotel, type, beds, max occupancy, price per night (HTL-03)' })
  addRoom(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CreateRoomDto, @CurrentUser() user: AuthUser) {
    return this.service.addRoom(id, dto, user);
  }

  @Public()
  @Get(':id/rooms/available')
  @ApiOperation({ summary: 'Rooms free for the searched dates with total stay price, paginated (HTL-15, GEN-05)' })
  available(@Param('id', ParseObjectIdPipe) id: string, @Query() q: StayQueryDto) {
    return this.service.availableRooms(id, q.checkIn, q.checkOut, q.page);
  }

  @Patch(':id/rooms/:roomId')
  @Roles(Role.HOTEL_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Edit beds, occupancy, price; deactivate/reactivate (HTL-05, HTL-06)' })
  updateRoom(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @Body() dto: UpdateRoomDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateRoom(id, roomId, dto, user);
  }

  @Delete(':id/rooms/:roomId')
  @Roles(Role.HOTEL_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Delete a room that has never been reserved (HTL-06)' })
  deleteRoom(@Param('id', ParseObjectIdPipe) id: string, @Param('roomId', ParseObjectIdPipe) roomId: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteRoom(id, roomId, user);
  }

  @Post(':id/rooms/:roomId/availability')
  @Roles(Role.HOTEL_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Add a non-overlapping bookable date range (nights, inclusive) (HTL-04)' })
  addAvailability(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @Body() dto: DateRangeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addAvailability(id, roomId, dto, user);
  }

  @Patch(':id/rooms/:roomId/availability')
  @Roles(Role.HOTEL_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Update/remove an availability range, or block/unblock dates (HTL-05, HTL-06)',
    description: 'action=update|remove need rangeId (+from/to for update). action=block needs from/to; action=unblock needs rangeId = block id. Removing availability with reservations and blocking over Confirmed/Pending reservations are rejected.',
  })
  patchAvailability(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @Body() dto: PatchAvailabilityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.patchAvailability(id, roomId, dto, user);
  }

  @Get(':id/availability')
  @Roles(Role.HOTEL_MODERATOR)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Room status per date: Available / Booked (with reference) / Blocked; rooms paginated (HTL-08, GEN-05)' })
  grid(@Param('id', ParseObjectIdPipe) id: string, @Query() q: AvailabilityQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.availabilityGrid(id, q, user);
  }
}
