import { InventoryService, nextInStoreCodes } from './inventory.service';
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

describe('nextInStoreCodes', () => {
  it('starts at 0001 for a shop with no in-store codes yet', () => {
    expect(nextInStoreCodes(null, 3)).toEqual(['0001', '0002', '0003']);
  });

  it("continues from the shop's highest code, keeping its width", () => {
    expect(nextInStoreCodes('0264', 2)).toEqual(['0265', '0266']);
    expect(nextInStoreCodes('133890', 1)).toEqual(['133891']);
  });

  it('grows past the padding instead of wrapping', () => {
    expect(nextInStoreCodes('9999', 2)).toEqual(['10000', '10001']);
  });
});

describe('InventoryService.assignBarcodes', () => {
  const setup = (targets: { id: string }[], highest: string | null) => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue(highest ? [{ barcode: highest }] : []),
      inventoryItem: {
        findMany: jest.fn().mockResolvedValue(targets),
        update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data, onHandQuantity: 1, reservedQuantity: 0, reorderLevel: 0, unitPrice: 0 })),
      },
    };
    const prisma = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
    return { tx, service: new InventoryService(prisma as unknown as PrismaService) };
  };

  it('gives each item without a barcode the next code, in creation order', async () => {
    const { tx, service } = setup([{ id: 'a' }, { id: 'b' }], '0264');

    const result = await service.assignBarcodes('org-1');

    expect(result.map((i) => [i.id, i.barcode])).toEqual([['a', '0265'], ['b', '0266']]);
    expect(tx.$executeRaw).toHaveBeenCalled(); // per-org lock taken before allocating
    expect(tx.inventoryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', barcode: null, isActive: true }) }),
    );
  });

  it('limits to the given items and does nothing when none need a code', async () => {
    const { tx, service } = setup([], null);

    expect(await service.assignBarcodes('org-1', ['x'])).toEqual([]);
    expect(tx.inventoryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['x'] } }) }),
    );
    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
  });
});

