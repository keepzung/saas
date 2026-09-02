import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContentService } from './content.service';
import {
  BatchTaskDto,
  ImportProductsDto,
  MaterialDto,
  MaterialUpdateDto,
  MoveProductDto,
  PackageDto,
  ProductDto,
  ReviewDto,
} from './dto/content.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private contentService: ContentService) {}

  @Get('products')
  products(@Query('brandId') brandId?: string) {
    return this.contentService.products(brandId ? Number(brandId) : 1);
  }

  @Post('products')
  createProduct(@Body() dto: ProductDto) {
    return this.contentService.createProduct(dto);
  }

  @Post('products/import')
  importProducts(@Body() dto: ImportProductsDto) {
    return this.contentService.importProducts(dto);
  }

  @Put('products/:id')
  updateProduct(@Param('id', ParseIntPipe) id: number, @Body() dto: ProductDto) {
    return this.contentService.updateProduct(id, dto);
  }

  @Delete('products/:id')
  deleteProduct(@Param('id', ParseIntPipe) id: number) {
    return this.contentService.deleteProduct(id);
  }

  @Patch('products/:id/move')
  moveProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveProductDto,
  ) {
    return this.contentService.moveProduct(id, dto);
  }

  @Get('overview')
  overview(@Query('brandId') brandId?: string) {
    return this.contentService.overview(brandId ? Number(brandId) : 1);
  }

  @Get('campaign/packages')
  packages(
    @Query()
    query: { page?: string; pageSize?: string; keyword?: string; brandId?: string },
  ) {
    return this.contentService.packages(query);
  }

  @Post('campaign/packages')
  createPackage(@Body() dto: PackageDto, @Req() req: Request) {
    const user = req.user as { id: number };
    return this.contentService.createPackage(dto, user.id);
  }

  @Put('campaign/packages/:id')
  updatePackage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PackageDto,
  ) {
    return this.contentService.updatePackage(id, dto);
  }

  @Delete('campaign/packages/:id')
  deletePackage(@Param('id', ParseIntPipe) id: number) {
    return this.contentService.deletePackage(id);
  }

  @Get('campaign/packages/:id/materials')
  materials(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: { status?: string },
  ) {
    return this.contentService.materials(id, query);
  }

  @Post('campaign/packages/:id/materials')
  addMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MaterialDto,
  ) {
    return this.contentService.addMaterial(id, dto);
  }

  @Put('campaign/materials/:id')
  updateMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MaterialUpdateDto,
  ) {
    return this.contentService.updateMaterial(id, dto);
  }

  @Delete('campaign/materials/:id')
  deleteMaterial(@Param('id', ParseIntPipe) id: number) {
    return this.contentService.deleteMaterial(id);
  }

  @Post('campaign/materials/batch-submit')
  submitMaterials(@Body() body: { ids: number[] }) {
    return this.contentService.submitMaterials(body.ids ?? []);
  }

  @Post('campaign/reviews/approve')
  approve(@Body() body: { id: number } & ReviewDto) {
    return this.contentService.reviewMaterial(body.id, 'approve', body);
  }

  @Post('campaign/reviews/reject')
  reject(@Body() body: { id: number } & ReviewDto) {
    return this.contentService.reviewMaterial(body.id, 'reject', body);
  }

  @Post('campaign/reviews/brand-approve')
  brandApprove(@Body() body: { id: number } & ReviewDto) {
    return this.contentService.brandReview(body.id, 'brand-approve', body);
  }

  @Post('campaign/reviews/brand-reject')
  brandReject(@Body() body: { id: number } & ReviewDto) {
    return this.contentService.brandReview(body.id, 'brand-reject', body);
  }

  @Get('batch-tasks')
  batchTasks(@Query() query: { page?: string; page_size?: string; status?: string }) {
    return this.contentService.batchTasks(query);
  }

  @Post('batch-tasks')
  createBatchTask(@Body() dto: BatchTaskDto, @Req() req: Request) {
    const user = req.user as { id: number };
    return this.contentService.createBatchTask(dto, user.id);
  }

  @Post('batch-tasks/:id/cancel')
  cancelBatchTask(@Param('id', ParseIntPipe) id: number) {
    return this.contentService.cancelBatchTask(id);
  }
}
