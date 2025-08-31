import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [OrdersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
