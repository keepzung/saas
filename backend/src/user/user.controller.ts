import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserService } from './user.service';

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
}
