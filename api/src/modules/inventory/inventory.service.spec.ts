import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';

describe('InventoryService.bulkImport', () => {
  let service: InventoryService;
  let create: jest.SpyInstance;

  beforeEach(() => {
    service = new InventoryService({} as PrismaService);
    create = jest.spyOn(service, 'create').mockResolvedValue({} as any);
  });

  it('keeps a quoted name containing a comma in its own column', async () => {
    const csv = [
      '﻿name,barcode,sellPrice,unitPrice,department',
      '"Indomie Chicken, 70g",6151100000059,250,200,Noodles',
    ].join('\r\n');

    const result = await service.bulkImport('org-1', 'user-1', csv);

    expect(result).toMatchObject({ total: 1, created: 1, failed: 0 });
    expect(create).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        name: 'Indomie Chicken, 70g',
        barcode: '6151100000059',
        sellPrice: 250,
        unitPrice: 200,
        department: 'Noodles',
      }),
    );
  });

  it('reports a row with no name without blocking the others', async () => {
    const result = await service.bulkImport('org-1', 'user-1', 'name,sellPrice\n,100\nRice,9000');

    expect(result).toMatchObject({ total: 2, created: 1, failed: 1 });
    expect(result.results[0]).toEqual({ row: 2, status: 'error', error: 'Missing name' });
  });
});
