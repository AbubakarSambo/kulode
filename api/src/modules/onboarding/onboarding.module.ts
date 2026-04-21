import { Module } from '@nestjs/common';
import { OnboardingCron } from './onboarding.cron';

@Module({
  providers: [OnboardingCron],
})
export class OnboardingModule {}
