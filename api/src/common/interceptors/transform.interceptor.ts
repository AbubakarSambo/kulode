import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import * as fs from 'fs';
import * as path from 'path';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

let cachedVersion = '1.0.0';
try {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  cachedVersion = packageJson.version || '1.0.0';
} catch (e) {
  // fallback if package.json cannot be read
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const ctxType = context.getType();
    if (ctxType === 'http') {
      const response = context.switchToHttp().getResponse();
      if (response && typeof response.setHeader === 'function') {
        response.setHeader('x-app-version', cachedVersion);
      }
    }

    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
      })),
    );
  }
}
