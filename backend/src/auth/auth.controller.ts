import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller()
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('getcompanybyuserid')
  companiesByUserId(@Query('user_id') userId: string) {
    return this.authService.companiesByUserId(Number(userId));
  }
}
