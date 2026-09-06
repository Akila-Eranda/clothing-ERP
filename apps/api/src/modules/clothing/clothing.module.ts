import { Module } from '@nestjs/common';
import { InventoryModule } from '@/modules/inventory/inventory.module';
import { ClothingController } from './clothing.controller';
import { ClothingService } from './clothing.service';

@Module({
  imports: [InventoryModule],
  controllers: [ClothingController],
  providers: [ClothingService],
  exports: [ClothingService],
})
export class ClothingModule {}
