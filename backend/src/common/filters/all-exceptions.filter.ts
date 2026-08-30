import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let msg = '服务器内部错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        msg = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        msg = (r.message as string) ?? exception.message;
        if (Array.isArray(r.message) && r.message.length > 0) {
          msg = r.message.join('; ');
        }
      }
    } else if (exception instanceof Error) {
      msg = exception.message;
    }

    response.status(status).json({
      code: status,
      data: null,
      msg,
    });
  }
}
