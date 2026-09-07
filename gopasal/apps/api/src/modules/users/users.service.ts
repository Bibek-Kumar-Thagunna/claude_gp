import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        email: true,
        name: true,
        avatarUrl: true,
        locale: true,
        status: true,
        isPlatformStaff: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(
    userId: string,
    patch: { name?: string; email?: string; locale?: string; avatarUrl?: string },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: patch.name,
        email: patch.email,
        locale: patch.locale,
        avatarUrl: patch.avatarUrl,
      },
      select: { id: true, phone: true, email: true, name: true, avatarUrl: true, locale: true },
    });
  }
}
