import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccessService } from './access.service';

@Controller('access')
@UseGuards(JwtAuthGuard)
export class AccessController {
  constructor(private accessService: AccessService) {}

  @Get('policy')
  policy() {
    return this.accessService.getPolicy();
  }
}
