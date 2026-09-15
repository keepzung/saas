import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Envelope<T> {
  code: number;
  data: T;
  msg: string;
}

export class EnvelopeResponse<T> {
  constructor(
    public readonly code: number,
    public readonly data: T,
    public readonly msg = 'success',
  ) {}
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Envelope<T>> {
  intercept(
    _ctx: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<Envelope<any>> {
    return next.handle().pipe(
      map((data: any) => {
        if (data instanceof EnvelopeResponse) {
          return { code: data.code, data: data.data ?? null, msg: data.msg };
        }
        return {
          code: 100,
          data: data ?? null,
          msg: 'success',
        };
      }),
    );
  }
}
