import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { createDatabase } from '@quantum-parks/db';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly connection = createDatabase(
    process.env.DATABASE_URL ??
      'postgresql://quantum_parks:quantum_parks@localhost:5432/quantum_parks',
  );

  readonly db: ReturnType<typeof createDatabase>['db'] = this.connection.db;

  async onModuleDestroy() {
    await this.connection.pool.end();
  }
}
