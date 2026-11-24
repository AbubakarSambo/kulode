import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ROLES_KEY, Role } from '../../common';
import { UpdateCollectionPolicyDto } from './dto';
import { InvoiceCollectionsController } from './invoice-collections.controller';

const rolesOn = (method: keyof InvoiceCollectionsController): string[] =>
  new Reflector().get<string[]>(ROLES_KEY, InvoiceCollectionsController.prototype[method]) ?? [];

describe('InvoiceCollectionsController', () => {
  describe('who may do what', () => {
    it('only admins can change the policy (switch on, auto-send, pause)', () => {
      expect(rolesOn('updatePolicy').sort()).toEqual([Role.ADMIN, Role.SUPER_ADMIN].sort());
    });

    it('invoicing roles can read the policy and approve or skip reminders', () => {
      const invoicing = [Role.ACCOUNTANT, Role.ADMIN, Role.STAFF, Role.SUPER_ADMIN].sort();
      for (const method of ['getPolicy', 'listPending', 'approve', 'skip'] as const) {
        expect(rolesOn(method).sort()).toEqual(invoicing);
      }
    });

    it('keeps floor and kitchen roles out of every endpoint', () => {
      const floor = [Role.WAITER, Role.CASHIER, Role.KITCHEN, Role.RUNNER, Role.PASS, Role.STOREKEEPER];
      for (const method of ['getPolicy', 'updatePolicy', 'listPending', 'approve', 'skip'] as const) {
        for (const role of floor) expect(rolesOn(method)).not.toContain(role);
      }
    });
  });

  describe('routes act only on the caller\'s own organization', () => {
    const service: any = {
      getPolicy: jest.fn(),
      upsertPolicy: jest.fn(),
      listPendingReminders: jest.fn(),
      approveReminder: jest.fn(),
      skipReminder: jest.fn(),
    };
    const controller = new InvoiceCollectionsController(service);
    afterEach(() => jest.clearAllMocks());

    it('passes the organization from the token, never from the request', async () => {
      await controller.approve('rem-1', 'org-1');
      await controller.skip('rem-2', 'org-1');
      await controller.listPending('org-1');
      await controller.getPolicy('org-1');
      await controller.updatePolicy('org-1', { paused: true });

      expect(service.approveReminder).toHaveBeenCalledWith('org-1', 'rem-1');
      expect(service.skipReminder).toHaveBeenCalledWith('org-1', 'rem-2');
      expect(service.listPendingReminders).toHaveBeenCalledWith('org-1');
      expect(service.getPolicy).toHaveBeenCalledWith('org-1');
      expect(service.upsertPolicy).toHaveBeenCalledWith('org-1', { paused: true });
    });
  });
});

describe('UpdateCollectionPolicyDto validation', () => {
  const errorsFor = async (body: unknown) => validate(plainToInstance(UpdateCollectionPolicyDto, body), { whitelist: true, forbidNonWhitelisted: true });

  it('accepts an empty body (everything optional)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('accepts a valid full policy', async () => {
    expect(
      await errorsFor({
        schedule: [
          { offsetDays: -2, template: 'pre_due' },
          { offsetDays: 3, template: 'payment_reminder' },
        ],
        mode: 'AUTO',
        sendHour: 9,
        maxMessages: 4,
        paused: false,
      }),
    ).toHaveLength(0);
  });

  it.each([
    ['a send hour inside quiet hours', { sendHour: 22 }],
    ['a send hour before quiet hours end', { sendHour: 6 }],
    ['an unknown mode', { mode: 'YOLO' }],
    ['a message cap of zero', { maxMessages: 0 }],
    ['a message cap above ten', { maxMessages: 11 }],
    ['an empty schedule', { schedule: [] }],
    ['an unknown template label', { schedule: [{ offsetDays: 1, template: 'threaten_legal' }] }],
    ['a fractional offset', { schedule: [{ offsetDays: 1.5, template: 'due' }] }],
    ['an offset beyond 90 days', { schedule: [{ offsetDays: 120, template: 'due' }] }],
    ['an unknown field', { organizationId: 'someone-elses-org' }],
  ])('rejects %s', async (_label, body) => {
    expect((await errorsFor(body)).length).toBeGreaterThan(0);
  });
});
