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
import { ProjectService } from './project.service';
import {
  CreateFolderDto,
  CreateProjectDto,
  UpdateFolderDto,
  UpdateProjectDto,
} from './dto/project.dto';

@Controller('project')
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(private projectService: ProjectService) {}

  @Get('workspaces')
  workspaces(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.projectService.workspaces(user.id);
  }

  @Get('workspace')
  workspace(
    @Req() req: Request,
    @Query('brandId') brandId?: string,
  ) {
    const user = req.user as { id: number };
    return this.projectService.workspace(
      user.id,
      brandId ? Number(brandId) : undefined,
    );
  }

  @Get('members')
  members(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.projectService.members(user.id);
  }

  @Get('folders')
  folders(@Query('brandId') brandId?: string) {
    return this.projectService.folders(brandId ? Number(brandId) : 1);
  }

  @Post('folders')
  createFolder(@Body() dto: CreateFolderDto) {
    return this.projectService.createFolder(dto);
  }

  @Put('folders/:id')
  updateFolder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFolderDto,
  ) {
    return this.projectService.updateFolder(id, dto);
  }

  @Delete('folders/:id')
  deleteFolder(@Param('id', ParseIntPipe) id: number) {
    return this.projectService.deleteFolder(id);
  }

  @Get('projects')
  list(
    @Query()
    query: {
      page?: string;
      page_size?: string;
      folder_id?: string;
      status?: string;
      keyword?: string;
      owner_id?: string;
      brand_id?: string;
    },
  ) {
    return this.projectService.list(query);
  }

  @Post('projects')
  create(@Body() dto: CreateProjectDto, @Req() req: Request) {
    const user = req.user as { id: number };
    return this.projectService.create(dto, user.id);
  }

  @Get('projects/:id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.projectService.detail(id);
  }

  @Put('projects/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectService.update(id, dto);
  }

  @Delete('projects/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.projectService.remove(id);
  }

  @Post('projects/:id/archive')
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.projectService.archive(id, true);
  }

  @Post('projects/:id/unarchive')
  unarchive(@Param('id', ParseIntPipe) id: number) {
    return this.projectService.archive(id, false);
  }
}
