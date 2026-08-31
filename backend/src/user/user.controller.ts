import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserService } from './user.service';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/user.dto';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get('info')
  info(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.userService.getInfo(user.id);
  }

  @Get('companymodulelist')
  moduleList(@Query('user_id') userId: string, @Req() req: Request) {
    const user = req.user as { id: number };
    return this.userService.getModuleList(Number(userId) || user.id);
  }

  @Get('actionlist')
  actionList(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.userService.getActionList(user.id);
  }

  @Get('manage/list')
  manageList(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.userService.listUsers(user.id);
  }

  @Post('manage')
  manageCreate(@Req() req: Request, @Body() dto: CreateUserDto) {
    const user = req.user as { id: number };
    return this.userService.createUser(user.id, dto);
  }

  @Put('manage/:id')
  manageUpdate(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    const user = req.user as { id: number };
    return this.userService.updateUser(user.id, id, dto);
  }

  @Put('manage/:id/password')
  manageResetPassword(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    const user = req.user as { id: number };
    return this.userService.resetPassword(user.id, id, dto);
  }
}
