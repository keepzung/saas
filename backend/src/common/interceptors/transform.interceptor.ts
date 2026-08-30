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

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Envelope<T>> {
  intercept(
    _ctx: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<Envelope<any>> {
    return next.handle().pipe(
      map((data: any) => ({
        code: 100,
        data: data ?? null,
        msg: 'success',
      })),
    );
  }
}
