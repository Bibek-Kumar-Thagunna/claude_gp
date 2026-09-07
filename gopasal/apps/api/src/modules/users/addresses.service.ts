import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AddressInput {
  label?: string;
  recipientName: string;
  phone: string;
  area: string;
  landmark?: string;
  fullAddress: string;
  lat?: number;
  lng?: number;
  isDefault?: boolean;
}

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, input: AddressInput) {
    const count = await this.prisma.address.count({ where: { userId } });
    const makeDefault = input.isDefault || count === 0; // first address is default
    return this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.create({ data: { ...input, isDefault: makeDefault, userId } });
    });
  }

  async update(userId: string, id: string, input: Partial<AddressInput>) {
    await this.mustOwn(userId, id);
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.update({ where: { id }, data: input });
    });
  }

  async setDefault(userId: string, id: string) {
    await this.mustOwn(userId, id);
    await this.prisma.$transaction([
      this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } }),
      this.prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return { id, isDefault: true };
  }

  async remove(userId: string, id: string) {
    await this.mustOwn(userId, id);
    await this.prisma.address.delete({ where: { id } });
    return { deleted: true };
  }

  private async mustOwn(userId: string, id: string) {
    const addr = await this.prisma.address.findUnique({ where: { id } });
    if (!addr) throw new NotFoundException('Address not found');
    if (addr.userId !== userId) throw new ForbiddenException('Not your address');
    return addr;
  }
}
