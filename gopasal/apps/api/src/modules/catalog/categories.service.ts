import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async get(slug: string) {
    const cat = await this.prisma.category.findUnique({ where: { slug } });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  /** Admin/seed use: upsert by slug. */
  upsert(input: {
    slug: string;
    en: string;
    np: string;
    icon: string;
    hue: string;
    sortOrder?: number;
  }) {
    return this.prisma.category.upsert({
      where: { slug: input.slug },
      create: { ...input, sortOrder: input.sortOrder ?? 0 },
      update: { en: input.en, np: input.np, icon: input.icon, hue: input.hue, sortOrder: input.sortOrder ?? 0 },
    });
  }
}
