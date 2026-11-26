// 原视频播放流：<video> 标签无法携带自定义 token 头，走独立无鉴权端点；
// 仅放行 isPublic 公开内容（与 /uploads 静态目录同级），私有品牌内容不外泄
import { Controller, Get, NotFoundException, Param, ParseIntPipe, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import * as stream from 'stream';
import { HotspotService } from './hotspot.service';

@Controller('hotspot-public')
export class HotspotPublicController {
  constructor(private hotspot: HotspotService) {}

  @Get('contents/:id/stream')
  async streamContent(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const target = await this.hotspot.publicVideoTarget(id);
    if (!target?.videoUrl) throw new NotFoundException('视频源不可用');
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    };
    if (target.platform === 'bilibili') headers.Referer = 'https://www.bilibili.com/';
    if (target.platform === 'xhs') headers.Referer = 'https://www.xiaohongshu.com/';
    if (req.headers.range) headers.Range = req.headers.range;
    let upstream: globalThis.Response | null = null;
    try {
      upstream = await fetch(target.videoUrl, { headers });
    } catch {
      throw new NotFoundException('视频源拉取失败');
    }
    if (!upstream.ok && upstream.status !== 206) throw new NotFoundException('视频源拉取失败');
    res.status(upstream.status);
    for (const h of ['content-type', 'content-length', 'content-range']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    if (!upstream.body) {
      res.end();
      return;
    }
    stream.Readable.fromWeb(upstream.body as import('stream/web').ReadableStream).pipe(res);
  }
}
