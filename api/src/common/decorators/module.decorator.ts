import { SetMetadata } from '@nestjs/common';

export const REQUIRES_MODULE_KEY = 'requiresModule';
export const RequiresModule = (...modules: ('POS' | 'INVOICING')[]) => SetMetadata(REQUIRES_MODULE_KEY, modules);
