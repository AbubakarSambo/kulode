import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';

// In-memory stand-in for the three tables the invoice stock methods touch
function setup(lines: { quantity: number; ingredients: { inventoryItemId: string; quantityPerUnit: number }[] }[], stock: Record<string, number>) {
  const movements: any[] = [];
  const tx = {
    invoiceItem: {
      findMany: jest.fn().mockImplementation(({ where }) =>
        // Recipe dishes carry no inventoryItemId, so the product query finds none of these lines
        where.menuItemId ? lines.map((l) => ({ quantity: l.quantity, menuItem: { ingredients: l.ingredients } })) : [],
      ),
    },
    inventoryItem: {
      findFirst: jest.fn().mockImplementation(({ where }) => (where.id in stock ? { id: where.id, onHandQuantity: stock[where.id] } : null)),
      update: jest.fn().mockImplementation(({ where, data }) => { stock[where.id] = data.onHandQuantity; }),
    },
    stockMovement: {
      create: jest.fn().mockImplementation(({ data }) => { movements.push(data); }),
      findMany: jest.fn().mockImplementation(({ where }) => movements.filter((m) => where.notes.in.includes(m.notes))),
    },
  };
  return { tx: tx as any, stock, movements, service: new InventoryService({} as PrismaService) };
}

describe('InventoryService invoice recipe stock', () => {
  const jollof = { quantity: 10, ingredients: [{ inventoryItemId: 'rice', quantityPerUnit: 0.25 }] };

  it('takes ingredients off for every dish line when the invoice is paid', async () => {
    const { tx, stock, service } = setup([jollof, { quantity: 4, ingredients: [{ inventoryItemId: 'rice', quantityPerUnit: 0.5 }] }], { rice: 20 });

    await service.deductOnPayment(tx, 'inv', 'org');

    expect(stock.rice).toBe(15.5);
  });

  it('puts back only what came off when stock ran short, even if the recipe changed', async () => {
    const lines = [{ ...jollof }];
    const { tx, stock, service } = setup(lines, { rice: 1 });

    await service.deductOnPayment(tx, 'inv', 'org');
    expect(stock.rice).toBe(0);

    lines[0] = { quantity: 10, ingredients: [{ inventoryItemId: 'rice', quantityPerUnit: 9 }] };
    await service.reversePaymentDeduction(tx, 'inv', 'org');

    expect(stock.rice).toBe(1);
  });

  it('does not restore twice across repeated pay and reverse cycles', async () => {
    const { tx, stock, service } = setup([jollof], { rice: 20 });

    for (let i = 0; i < 2; i++) {
      await service.deductOnPayment(tx, 'inv', 'org');
      await service.reversePaymentDeduction(tx, 'inv', 'org');
    }

    expect(stock.rice).toBe(20);
  });
});
