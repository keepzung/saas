import {
  Body,
  Controller,
  Delete,
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
import { KolService } from './kol.service';
import {
  AuthorsListDto,
  CollectDto,
  ReviewActionDto,
  UpdateCreatorDto,
} from './dto/kol.dto';

@Controller('kol')
@UseGuards(JwtAuthGuard)
export class KolController {
  constructor(private kolService: KolService) {}

  @Post('authors/list')
  authorsList(@Body() dto: AuthorsListDto) {
    return this.kolService.authorsList(dto);
  }

  @Get('list')
  libraryList(
    @Query()
    query: {
      page?: string;
      page_size?: string;
      keyword?: string;
      owner_id?: string;
      contact_status?: string;
      resource_status?: string;
      mcn?: string;
    },
  ) {
    return this.kolService.libraryList(query);
  }

  @Post('collect')
  collect(@Body() dto: CollectDto, @Req() req: Request) {
    const user = req.user as { id: number };
    return this.kolService.collect(dto, user.id);
  }

  @Delete('list/:id')
  uncollect(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.kolService.uncollect(id, user.id);
  }

  @Put('list/:id')
  updateCreator(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCreatorDto,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.kolService.updateCreator(id, dto, user.id);
  }

  @Post('list/:id/toggle-status')
  toggleStatus(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.kolService.toggleStatus(id, user.id);
  }

  @Get('institutions')
  institutions(
    @Query()
    query: {
      institution_keyword?: string;
      include_unassigned?: string;
      sort_field?: string;
      sort_order?: string;
      page?: string;
      page_size?: string;
    },
  ) {
    return this.kolService.institutions(query);
  }

  @Get('institution-creators')
  institutionCreators(
    @Query()
    query: { institution_name: string; page?: string; page_size?: string },
  ) {
    return this.kolService.institutionCreators(query);
  }

  @Get('user/list')
  userList(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.kolService.userList(user.id);
  }

  @Get('mcns')
  mcns() {
    return this.kolService.mcns();
  }

  @Get('tags')
  tags() {
    return this.kolService.tags();
  }

  @Get('region/tree')
  regionTree() {
    return this.kolService.regionTree();
  }

  @Get('import/template')
  importTemplate() {
    return this.kolService.importTemplate();
  }

  @Get('reviews')
  reviews(@Query() query: { status?: string; page?: string; page_size?: string }) {
    return this.kolService.reviews(query);
  }

  @Get('reviews/pending-count')
  pendingCount() {
    return this.kolService.pendingCount();
  }

  @Post('reviews/:id/approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewActionDto,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.kolService.reviewAction(id, 'approve', dto, user.id);
  }

  @Post('reviews/:id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewActionDto,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.kolService.reviewAction(id, 'reject', dto, user.id);
  }

  @Get('logs')
  logs(@Query() query: { page?: string; page_size?: string; action_type?: string }) {
    return this.kolService.logs(query);
  }
}
