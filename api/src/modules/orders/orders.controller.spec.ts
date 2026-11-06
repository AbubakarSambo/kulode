import { OrdersController } from './orders.controller';

describe('OrdersController.create — waiter defaulting', () => {
  const create = jest.fn().mockResolvedValue({});
  // Only ordersService.create is exercised; the other collaborators are irrelevant here.
  const controller = new (OrdersController as any)({ create });
  const user = (roles: string[]) => ({ id: 'u1', organizationId: 'org1', roles });

  beforeEach(() => create.mockClear());

  it('assigns the waiter/cashier ringing the order up as its waiter', () => {
    controller.create({ items: [] }, user(['WAITER']));
    expect(create).toHaveBeenCalledWith('org1', 'u1', expect.objectContaining({ waiterId: 'u1' }));
    controller.create({ items: [] }, user(['CASHIER']));
    expect(create).toHaveBeenLastCalledWith('org1', 'u1', expect.objectContaining({ waiterId: 'u1' }));
  });

  it('leaves the order unassigned when a manager/admin places it', () => {
    controller.create({ items: [] }, user(['MANAGER']));
    expect(create.mock.calls[0][2].waiterId).toBeUndefined();
  });

  it('keeps an explicit waiterId', () => {
    controller.create({ items: [], waiterId: 'w9' }, user(['WAITER']));
    expect(create).toHaveBeenCalledWith('org1', 'u1', expect.objectContaining({ waiterId: 'w9' }));
  });
});
