This project currently uses SQLite in development (`file:./dev.db`) via Prisma.

To migrate to PostgreSQL in production later:

1. Set `DATABASE_URL` in the API `.env` file to your PostgreSQL connection string.
2. Update `prisma.config.ts` `datasource.url` to point to the same environment variable.
3. Run `npx prisma migrate dev` locally against PostgreSQL to create production-ready migrations.
4. Use `npx prisma migrate deploy` in production.

