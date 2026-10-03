import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator';
import { PrismaService } from './common/prisma/prisma.service';
import { RedisService } from './common/redis/redis.service';
import { MALWARE_SCANNER, type MalwareScanner } from './providers/malware-scanner.provider';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Readiness dependency check (compatibility route)' })
  async check() {
    return this.ready();
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Process liveness check' })
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Database, cache and file-safety scanner readiness check' })
  async ready() {
    const [db, cache, scanner] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'up').catch(() => 'down'),
      this.redis.client.ping().then(() => 'up').catch(() => 'down'),
      this.scanner.name === 'disabled'
        ? Promise.resolve('disabled')
        : this.scanner.ready().then((up) => up ? 'up' : 'down').catch(() => 'down'),
    ]);
    const ok = db === 'up' && cache === 'up' && scanner !== 'down';
    const result = { status: ok ? 'ok' : 'degraded', db, cache, scanner, timestamp: new Date().toISOString() };
    if (!ok) throw new ServiceUnavailableException(result);
    return result;
  }
}
