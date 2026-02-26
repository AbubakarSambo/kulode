import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PLAN_KEY = 'requiresPlan';
export const RequiresPlan = (...plans: string[]) => SetMetadata(REQUIRES_PLAN_KEY, plans);
