import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // For Paystack webhook signature verification
  });

  const configService = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS - allow configured origins or all in development
  const allowedOrigins = configService.get<string>('app.corsOrigins');
  app.enableCors({
    origin: allowedOrigins ? allowedOrigins.split(',') : true,
    credentials: true,
  });

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Tari1 API')
    .setDescription('Multi-tenant invoicing and financial management API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Users', 'User management')
    .addTag('Organizations', 'Organization settings')
    .addTag('Clients', 'Client management')
    .addTag('Invoices', 'Invoice management')
    .addTag('Payments', 'Payment recording')
    .addTag('Expenses', 'Expense tracking')
    .addTag('Paystack', 'Paystack integration')
    .addTag('Reports', 'Financial reports')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('app.port') || 3000;
  await app.listen(port, '0.0.0.0'); // Listen on all interfaces

  logger.log(`Application running on: http://localhost:${port}`);
  logger.log(`Application also available on network at: http://192.168.1.111:${port}`);
  logger.log(`Swagger docs available at: http://localhost:${port}/api/docs`);
}

bootstrap();
